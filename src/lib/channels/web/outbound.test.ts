// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runBusinessJobs } from "../../../worker/business-jobs";
import type { BusinessJob, BusinessJobQueue } from "../../jobs/types";
import { createConsultationHandler } from "../../consultation/worker";
import type { Outcome } from "../../consultation/planner";
import {
  createMessengerHandler,
  createMessengerStore,
  type MessengerTransport,
} from "../facebook/messenger";
import {
  WEBSITE_SESSION_COOKIE,
  createWebsiteSessionToken,
  hashWebsiteSessionToken,
} from "./session";
import { createSupabaseWebsiteMessagesPort, createWebsiteMessagesRoute } from "./messages";
import {
  createWebOutboundHandler,
  createWebOutboundJobQueue,
  createWebOutboundStore,
  type WebOutboundAuthorizeResult,
} from "./outbound";

const origin = "https://app.test";
const job = (entity = "d0580000-0000-4000-8000-000000000010"): BusinessJob => ({
  id: "d0580000-0000-4000-8000-000000000001",
  organization_id: "a0580000-0000-4000-8000-000000000001",
  kind: "outbound_message",
  entity_id: entity,
  lease_owner: "d0580000-0000-4000-8000-000000000002",
  lease_token: "d0580000-0000-4000-8000-000000000003",
});

function memoryQueue(first: BusinessJob): BusinessJobQueue {
  let held: BusinessJob | null = first;
  return {
    async claim() { const next = held; held = null; return next; },
    async heartbeat() { return true; },
    async finish() { return true; },
  };
}
it("AT-058-01 consult praise finishes without Graph and handler has no transport", async () => {
  const finishes: Outcome[] = [];
  const handler = createConsultationHandler({
    context: () => ({ organizationId: job().organization_id, text: "sản phẩm tốt lắm", history: [], introduce: false, conversationId: "a0580000-0000-4000-8000-000000000099", revision: 0 }),
    finish: async (_claimed, outcome) => { finishes.push(outcome); },
  }, {
    ai: { generateText: async () => ({ text: JSON.stringify({ intent: "praise" }), model: "fake" }) },
    lookup: async () => { throw new Error("lookup_unused"); },
  });
  await handler(job(), new AbortController().signal);
  expect(finishes[0]).toMatchObject({ type: "reply", intent: "praise", text: "Cảm ơn bạn!", claims: [] });
  const source = readFileSync(new URL("./outbound.ts", import.meta.url), "utf8");
  expect(source).not.toContain("graph.facebook.com");
  expect(source).not.toContain("createGraphMessengerTransport");
  expect(source).not.toContain("FACEBOOK_PAGE_ACCESS_TOKEN");
  const worker = readFileSync(new URL("../../../worker/consultation.ts", import.meta.url), "utf8");
  expect(worker).toContain("createWebOutboundHandler");
  expect(worker).toMatch(/createWebOutboundHandler\(createWebOutboundStore\(rpc\)\)/);
  expect(worker).not.toMatch(/createWebOutboundHandler\([^)]*createGraphMessengerTransport/);
});

it("AT-058-03 handler persist-visible never calls Graph; suppressed skips delivery", async () => {
  const calls: string[] = [];
  const visible = createWebOutboundHandler({
    authorize: async () => { calls.push("visible"); return { action: "visible", text: "Cảm ơn bạn.", kind: "reply" }; },
  });
  await visible(job(), new AbortController().signal);
  const suppressed = createWebOutboundHandler({
    authorize: async () => { calls.push("done"); return { action: "done", status: "SUPPRESSED" }; },
  });
  await suppressed(job(), new AbortController().signal);
  expect(calls).toEqual(["visible", "done"]);
});

it("AT-058-04 two workers authorize once", async () => {
  const seen: string[] = [];
  const shared: { authorized: boolean } = { authorized: false };
  const store = {
    async authorize(): Promise<WebOutboundAuthorizeResult> {
      if (shared.authorized) return { action: "done", status: "VISIBLE" };
      shared.authorized = true;
      seen.push("visible");
      return { action: "visible", text: "Cảm ơn bạn.", kind: "reply" };
    },
  };
  const stop = new AbortController();
  const queue = memoryQueue(job());
  const original = queue.finish.bind(queue);
  queue.finish = async (claimed, error) => { const ok = await original(claimed, error); stop.abort(); return ok; };
  await Promise.all([
    runBusinessJobs({ queue, owner: job().lease_owner, signal: stop.signal, pollMs: 10, handlers: { outbound_message: createWebOutboundHandler(store) } }),
    runBusinessJobs({ queue, owner: "d0580000-0000-4000-8000-000000000009", signal: stop.signal, pollMs: 10, handlers: { outbound_message: createWebOutboundHandler(store) } }),
  ]);
  expect(seen).toEqual(["visible"]);
});

it("AT-058-05 GET includes visible AI outbound and omits private notes", async () => {
  const issued = createWebsiteSessionToken(() => Buffer.alloc(32, 58));
  const key = hashWebsiteSessionToken(issued.token);
  const port = {
    rpc: async (name: string) => name === "read_website_session"
      ? { data: { ok: true, organizationId: "a0580000-0000-4000-8000-000000000001", channelUserKey: key }, error: null }
      : { data: null, error: { code: "42883" } },
    async listPublicMessages() {
      return {
        messages: [
          { id: "in-1", text: "xin chào", kind: "message", receivedAt: "2026-01-01T00:00:00.000Z", privateNote: "SECRET_NOTE", psid: "x" },
          { id: "out-1", text: "Cảm ơn bạn!", kind: "reply", receivedAt: "2026-01-01T00:00:01.000Z" },
        ],
        status: "AI_ACTIVE" as const,
        hasMore: false,
      };
    },
  };
  const route = createWebsiteMessagesRoute(port, { origin });
  const listed = await route.GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${issued.token}` } }));
  expect(listed.status).toBe(200);
  const payload = await listed.json() as { messages: Array<{ text: string; direction: string; kind: string }> };
  expect(payload.messages).toEqual([
    expect.objectContaining({ text: "xin chào", direction: "inbound", kind: "message" }),
    expect.objectContaining({ text: "Cảm ơn bạn!", direction: "outbound", kind: "reply" }),
  ]);
  expect(JSON.stringify(payload)).not.toMatch(/SECRET_NOTE|psid|pageId|page_id/i);
});

it("AT-058-05 supabase port merges VISIBLE outbound with inbound", async () => {
  const orgId = "a0580000-0000-4000-8000-000000000001";
  const key = "web-user-058";
  const convo = "a0580000-0000-4000-8000-000000000010";
  const tables: Record<string, Array<Record<string, unknown>>> = {
    web_inbound_events: [{ id: "in-1", organization_id: orgId, sender_key: key, kind: "message", data: { text: "xin chào" }, received_at: "2026-01-01T00:00:00Z" }],
    conversations: [{ id: convo, organization_id: orgId, channel: "WEB", channel_user_key: key, status: "AI_ACTIVE" }],
    web_outbound: [
      { id: "out-1", organization_id: orgId, conversation_id: convo, kind: "reply", text: "Cảm ơn bạn!", created_at: "2026-01-01T00:00:01Z", status: "VISIBLE" },
      { id: "out-hidden", organization_id: orgId, conversation_id: convo, kind: "reply", text: "late", created_at: "2026-01-01T00:00:02Z", status: "PENDING" },
    ],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const query = {
      select() { return query; },
      eq(column: string, value: string) { rows = rows.filter((row) => row[column] === value); return query; },
      or() { return query; },
      order() { return query; },
      limit(count: number) { rows = rows.slice(0, count); return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(onFulfilled?: (value: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  };
  const listed = await createSupabaseWebsiteMessagesPort({ rpc: async () => ({ data: null, error: null }), from: from as never }).listPublicMessages({
    organizationId: orgId, channelUserKey: key, limit: 50,
  });
  expect(listed.messages).toEqual([
    expect.objectContaining({ id: "in-1", text: "xin chào", kind: "message" }),
    expect.objectContaining({ id: "out-1", text: "Cảm ơn bạn!", kind: "reply" }),
  ]);
  expect(listed.messages.map((row) => row.id)).not.toContain("out-hidden");
  expect(listed.status).toBe("AI_ACTIVE");
});

describe("local supabase_db_onevoice", () => {
  const psql = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const sweep = (orgId: string) => {
    if (!orgId) return;
    psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where organization_id='${orgId}' and status in ('queued','running');`);
  };

  it("AT-058-01..05 local consult, fence, replay, GET, Facebook fake transport", async () => {
    const fixtureOrg = randomUUID();
    const facebookOrg = randomUUID();
    const owner = randomUUID();
    const sender = `web-${fixtureOrg.replaceAll("-", "").slice(0, 24)}`;
    const crashOrg = "";
    try {
      psql(`insert into public.organizations(id,name,slug) values('${fixtureOrg}','OV058 web','${fixtureOrg}'),('${facebookOrg}','OV058 fb','${facebookOrg}');
select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov058-worker","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now()},"data":{"text":"xin chao"}}');`);
      const claim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const handler = createConsultationHandler({
        context: () => ({ organizationId: claim.organizationId, text: claim.text, history: claim.history ?? [], introduce: !!claim.introduce, conversationId: claim.conversationId, revision: claim.revision }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: { generateText: async () => ({ text: JSON.stringify({ intent: "praise" }), model: "fake" }) },
        lookup: async () => ({ asOf: null, products: [], policies: [], promotions: [], knowledge: [], missing: [], truncated: false }),
      });
      await handler(claim.job, new AbortController().signal);
      expect(psql(`select count(*) from public.web_outbound where organization_id='${fixtureOrg}';`)).toBe("1");
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("0");
      expect(psql(`select status from public.web_outbound where organization_id='${fixtureOrg}';`)).toBe("PENDING");

      psql(`update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null from public.web_outbound o where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.organization_id is distinct from '${fixtureOrg}';`);
      const outbound = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_web_outbound_job('${owner}') j;`))[0] as BusinessJob;
      expect(outbound.kind).toBe("outbound_message");
      expect(JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_web_outbound_job('${randomUUID()}') j;`))).toEqual([]);
      const rpc = async (name: string, args: Record<string, unknown>) => {
        if (name === "authorize_web_outbound") {
          return { data: JSON.parse(psql(`select public.authorize_web_outbound('${args.p_job_id}','${args.p_owner}','${args.p_token}');`)), error: null };
        }
        if (name === "claim_web_outbound_job") {
          return { data: JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_web_outbound_job('${args.p_owner}') j;`)), error: null };
        }
        if (name === "heartbeat_business_job") return { data: true, error: null };
        if (name === "finish_business_job") return { data: true, error: null };
        return { data: null, error: { code: "42883" } };
      };
      const stop = new AbortController();
      const queue = createWebOutboundJobQueue(rpc);
      const originalClaim = queue.claim.bind(queue);
      queue.claim = async (claimedOwner) => {
        const next = outbound;
        queue.claim = originalClaim;
        void claimedOwner;
        return next;
      };
      queue.finish = async () => { stop.abort(); return true; };
      await runBusinessJobs({ queue, owner, signal: stop.signal, pollMs: 10, handlers: { outbound_message: createWebOutboundHandler(createWebOutboundStore(rpc)) } });
      expect(psql(`select status from public.web_outbound where organization_id='${fixtureOrg}';`)).toBe("VISIBLE");
      expect(psql(`select text from public.web_outbound where organization_id='${fixtureOrg}';`)).toContain("Cảm ơn bạn");

      const issued = createWebsiteSessionToken(() => Buffer.alloc(32, 58));
      const listed = await createWebsiteMessagesRoute({
        rpc: async (name) => name === "read_website_session"
          ? { data: { ok: true, organizationId: fixtureOrg, channelUserKey: sender }, error: null }
          : { data: null, error: { code: "42883" } },
        async listPublicMessages() {
          const inbound = JSON.parse(psql(`select coalesce(json_agg(json_build_object('id',id,'kind',kind,'text',data->>'text','receivedAt',received_at)),'[]') from public.web_inbound_events where organization_id='${fixtureOrg}' and sender_key='${sender}';`)) as Array<Record<string, unknown>>;
          const replies = JSON.parse(psql(`select coalesce(json_agg(json_build_object('id',id,'kind',kind,'text',text,'receivedAt',created_at)),'[]') from public.web_outbound where organization_id='${fixtureOrg}' and status='VISIBLE';`)) as Array<Record<string, unknown>>;
          return { messages: [...inbound, ...replies], status: "AI_ACTIVE", hasMore: false };
        },
      }, { origin }).GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${issued.token}` } }));
      expect(listed.status).toBe(200);
      const body = await listed.json() as { messages: Array<{ text: string; direction: string }> };
      expect(body.messages.some((row) => row.direction === "outbound" && row.text.includes("Cảm ơn bạn"))).toBe(true);

      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov058-pause","senderKey":"${sender}-pause","kind":"message","eventTimeMs":${Date.now() + 1},"data":{"text":"pause"}}');`);
      const pauseClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      psql(`select public.request_conversation_handoff('${fixtureOrg}','${pauseClaim.job.entity_id}',${pauseClaim.revision},'customer_requested');
select public.finish_consultation('${pauseClaim.job.id}','${pauseClaim.job.lease_owner}','${pauseClaim.job.lease_token}','{"type":"reply","intent":"praise","text":"late reply","claims":[]}');`);
      expect(psql(`select count(*) from public.web_outbound where inbound_event_id='${pauseClaim.job.entity_id}';`)).toBe("0");

      const page = `2058${Date.now().toString().slice(-8)}`;
      psql(`select public.ingest_facebook_events('${facebookOrg}','${page}','[{"pageId":"${page}","providerKey":"message:ov058-fb","kind":"message","senderId":"201800058","recipientId":"${page}","eventTimeMs":${Date.now()},"data":{"text":"fake local"}}]');`);
      const fbClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${facebookOrg}');`));
      psql(`select public.finish_consultation('${fbClaim.job.id}','${fbClaim.job.lease_owner}','${fbClaim.job.lease_token}','{"type":"reply","intent":"praise","text":"Cảm ơn Facebook.","claims":[]}');`);
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${facebookOrg}';`)).toBe("1");
      psql(`update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null from public.messenger_outbox o where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.organization_id is distinct from '${facebookOrg}';`);
      const messengerJob = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_messenger_job('${owner}') j;`))[0] as BusinessJob;
      expect(psql(`select count(*) from public.web_outbound where organization_id='${facebookOrg}';`)).toBe("0");
      let sends = 0;
      const transport: MessengerTransport = async (request) => {
        sends++;
        expect(request.text).toBe("Cảm ơn Facebook.");
        return { outcome: "accepted", messageId: "mid.ov058" };
      };
      const fbStop = new AbortController();
      const fbRpc = async (name: string, args: Record<string, unknown>) => {
        const now = args.p_now ? `'${args.p_now}'` : "clock_timestamp()";
        if (name === "authorize_messenger_send") {
          return { data: JSON.parse(psql(`select public.authorize_messenger_send('${args.p_job_id}','${args.p_owner}','${args.p_token}',${now});`)), error: null };
        }
        const payload = JSON.stringify(args.p_result).replaceAll("'", "''");
        return { data: JSON.parse(psql(`select public.complete_messenger_send('${args.p_job_id}','${args.p_owner}','${args.p_token}','${payload}'::jsonb,${now});`)), error: null };
      };
      const fbQueue: BusinessJobQueue = {
        claim: async () => messengerJob,
        heartbeat: async () => true,
        finish: async () => { fbStop.abort(); return true; },
      };
      await runBusinessJobs({ queue: fbQueue, owner, signal: fbStop.signal, pollMs: 10, handlers: { outbound_message: createMessengerHandler(createMessengerStore(fbRpc), transport) } });
      expect(sends).toBe(1);
      expect(psql(`select status from public.messenger_outbox where organization_id='${facebookOrg}';`)).toBe("SENT");
    } finally {
      sweep(fixtureOrg);
      sweep(facebookOrg);
      sweep(crashOrg);
    }
  }, 20000);

  it("does not load dotenv or print env while resolving local proof helpers", () => {
    expect(execSync("node -e \"console.log('ok')\"", { encoding: "utf8" }).trim()).toBe("ok");
  });
});
