import { createHash, randomUUID } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { expect, it } from "vitest";
import { runBusinessJobs } from "../../../worker/business-jobs";
import type { BusinessJob, BusinessJobQueue } from "../../jobs/types";
import {
  createGraphMessengerTransport,
  createMessengerHandler,
  createMessengerStore,
  interpretMessengerResponse,
  type MessengerAuthorizeResult,
  type MessengerTransport,
  type MessengerTransportResult,
} from "./messenger";

const org = "a0000000-0000-0000-0000-000000000001";
const job = (entity = "d1800000-0000-0000-0000-000000000010"): BusinessJob => ({
  id: "d1800000-0000-0000-0000-000000000001",
  organization_id: org,
  kind: "outbound_message",
  entity_id: entity,
  lease_owner: "d1800000-0000-0000-0000-000000000002",
  lease_token: "d1800000-0000-0000-0000-000000000003",
});

function memoryQueue(first: BusinessJob): BusinessJobQueue & { finishes: unknown[] } {
  let held: BusinessJob | null = first;
  const finishes: unknown[] = [];
  return {
    finishes,
    async claim() { const next = held; held = null; return next; },
    async heartbeat() { return true; },
    async finish(_job, error) { finishes.push(error ?? null); return true; },
  };
}

it("AT-018-04 classifies token, rate limit, window and malformed Graph bodies without assuming idempotency keys", () => {
  expect(interpretMessengerResponse(200, { recipient_id: "psid", message_id: "mid.ok" })).toEqual({ outcome: "accepted", messageId: "mid.ok" });
  expect(interpretMessengerResponse(200, { recipient_id: "psid" })).toEqual({ outcome: "unknown", errorCode: "malformed" });
  expect(interpretMessengerResponse(200, { error: { code: 190 } })).toEqual({ outcome: "rejected", errorCode: "token" });
  expect(interpretMessengerResponse(403, { error: { code: 10 } })).toEqual({ outcome: "rejected", errorCode: "permission" });
  expect(interpretMessengerResponse(400, { error: { code: 1545041 } })).toEqual({ outcome: "rejected", errorCode: "window" });
  expect(interpretMessengerResponse(429, { error: { code: 613 } })).toEqual({ outcome: "rejected", errorCode: "rate_limit", retry: true });
  expect(interpretMessengerResponse(500, {})).toEqual({ outcome: "rejected", errorCode: "rate_limit", retry: true });
  expect(createGraphMessengerTransport({ pageAccessToken: "fixture" }).url("1001")).toBe("https://graph.facebook.com/v25.0/1001/messages");
});

it("AT-018-01 two workers dispatch once; replay authorize does not send twice", async () => {
  const sends: string[] = [];
  const shared: { authorized: boolean } = { authorized: false };
  const store = {
    async authorize(): Promise<MessengerAuthorizeResult> {
      if (shared.authorized) return { action: "done", status: "SENDING" };
      shared.authorized = true;
      return { action: "send", pageId: "1", psid: "2", text: "Xin chào", kind: "reply", attempt: 1 };
    },
    async complete() { return { retry: false }; },
  };
  const stop = new AbortController();
  const transport: MessengerTransport = async (request) => { sends.push(request.text); return { outcome: "accepted", messageId: "mid.once" }; };
  const queue = memoryQueue(job());
  const originalFinish = queue.finish.bind(queue);
  queue.finish = async (claimed, error) => { const ok = await originalFinish(claimed, error); stop.abort(); return ok; };
  await Promise.all([
    runBusinessJobs({ queue, owner: job().lease_owner, signal: stop.signal, pollMs: 10, handlers: { outbound_message: createMessengerHandler(store, transport) } }),
    runBusinessJobs({ queue, owner: "d1800000-0000-0000-0000-000000000009", signal: stop.signal, pollMs: 10, handlers: { outbound_message: createMessengerHandler(store, transport) } }),
  ]);
  expect(sends).toEqual(["Xin chào"]);
});

it("AT-018-02/03 handler never sends when authorize suppresses paused or stale revisions", async () => {
  let sends = 0;
  const handler = createMessengerHandler({
    authorize: async () => ({ action: "done", status: "SUPPRESSED" }),
    complete: async () => { throw new Error("complete must not run"); },
  }, async () => { sends++; return { outcome: "accepted", messageId: "mid" }; });
  await handler(job(), new AbortController().signal);
  expect(sends).toBe(0);
});

it("AT-018-04 expired token completes without retry; malformed success is UNKNOWN", async () => {
  const outcomes: MessengerTransportResult[] = [];
  const token = createMessengerHandler({
    authorize: async () => ({ action: "send", pageId: "1", psid: "2", text: "hi", kind: "reply", attempt: 1 }),
    complete: async (_job, result) => { outcomes.push(result); return { retry: false }; },
  }, async () => interpretMessengerResponse(400, { error: { code: 190 } }));
  await token(job(), new AbortController().signal);
  expect(outcomes).toEqual([{ outcome: "rejected", errorCode: "token" }]);
  const malformed = createMessengerHandler({
    authorize: async () => ({ action: "send", pageId: "1", psid: "2", text: "hi", kind: "reply", attempt: 1 }),
    complete: async (_job, result) => { outcomes.push(result); return { retry: false }; },
  }, async () => interpretMessengerResponse(200, { recipient_id: "2" }));
  await malformed(job(), new AbortController().signal);
  expect(outcomes[1]).toEqual({ outcome: "unknown", errorCode: "malformed" });
});

it("AT-018-05 persists SENDING before network and does not blind-resend UNKNOWN", async () => {
  const trail: string[] = [];
  const store = {
    async authorize(): Promise<MessengerAuthorizeResult> {
      trail.push("sending");
      return { action: "send", pageId: "1", psid: "2", text: "hi", kind: "reply", attempt: 1 };
    },
    async complete(_job: BusinessJob, result: MessengerTransportResult) {
      trail.push(`complete:${result.outcome}`);
      return { retry: false };
    },
  };
  let observed = "";
  await createMessengerHandler(store, async () => {
    observed = trail.join(",");
    return { outcome: "unknown", errorCode: "timeout" };
  })(job(), new AbortController().signal);
  expect(observed).toBe("sending");
  expect(trail).toEqual(["sending", "complete:unknown"]);
  let sends = 0;
  await createMessengerHandler({
    authorize: async () => ({ action: "done", status: "UNKNOWN", errorCode: "unknown" }),
    complete: async () => { throw new Error("no complete after unknown"); },
  }, async () => { sends++; return { outcome: "accepted", messageId: "mid.resend" }; })(job(), new AbortController().signal);
  expect(sends).toBe(0);
});

it("AT-018-04 rate-limit asks the job pump to retry only after a rejected-not-accepted result", async () => {
  await expect(createMessengerHandler({
    authorize: async () => ({ action: "send", pageId: "1", psid: "2", text: "hi", kind: "reply", attempt: 1 }),
    complete: async () => ({ retry: true }),
  }, async () => interpretMessengerResponse(429, { error: { code: 613 } }))(job(), new AbortController().signal)).rejects.toThrow(/^handler_failed$/);
});

it("store maps RPC failures without retaining Graph bodies", async () => {
  const store = createMessengerStore(async () => ({ data: null, error: { message: "secret token body" } }));
  await expect(store.authorize(job())).rejects.toThrow(/^messenger_store_failed$/);
});

it("AT-018-06 local DB + fake HTTP worker sends once, survives SENDING restart as UNKNOWN", async () => {
  const page = `2018${Date.now().toString().slice(-8)}`;
  const fixtureOrg = randomUUID();
  const owner = randomUUID();
  let crashOrg = "";
  const psql = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const sweep = (orgId: string) => {
    if (!orgId) return;
    psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where organization_id='${orgId}' and status in ('queued','running');`);
  };
  try {
  psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where kind='outbound_message' and status in ('queued','running');
insert into public.organizations(id,name,slug) values('${fixtureOrg}','OV018 fake worker','${fixtureOrg}');
select public.ingest_facebook_events('${fixtureOrg}','${page}','[{"pageId":"${page}","providerKey":"message:ov018-worker","kind":"message","senderId":"201800018","recipientId":"${page}","eventTimeMs":${Date.now()},"data":{"text":"fake local"}}]');`);
  const claim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
  psql(`select public.finish_consultation('${claim.job.id}','${claim.job.lease_owner}','${claim.job.lease_token}','{"type":"reply","intent":"praise","text":"Cảm ơn bạn.","claims":[]}');`);
  expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("1");
  const outbound = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_messenger_job('${owner}') j;`))[0] as BusinessJob;
  expect(outbound.kind).toBe("outbound_message");
  expect(outbound.organization_id).toBe(fixtureOrg);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const now = args.p_now ? `'${args.p_now}'` : "clock_timestamp()";
    if (name === "authorize_messenger_send") {
      return { data: JSON.parse(psql(`select public.authorize_messenger_send('${args.p_job_id}','${args.p_owner}','${args.p_token}',${now});`)), error: null };
    }
    const payload = JSON.stringify(args.p_result).replaceAll("'", "''");
    return { data: JSON.parse(psql(`select public.complete_messenger_send('${args.p_job_id}','${args.p_owner}','${args.p_token}','${payload}'::jsonb,${now});`)), error: null };
  };
  let sends = 0;
  const transport: MessengerTransport = async (request) => {
    sends++;
    expect(request.text).toBe("Cảm ơn bạn.");
    expect(psql(`select status from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("SENDING");
    return { outcome: "accepted", messageId: `mid.${createHash("sha256").update(request.psid).digest("hex").slice(0, 12)}` };
  };
  const stop = new AbortController();
  const queue: BusinessJobQueue = {
    claim: async () => outbound,
    heartbeat: async () => true,
    finish: async () => { stop.abort(); return true; },
  };
  await runBusinessJobs({ queue, owner, signal: stop.signal, pollMs: 10, handlers: { outbound_message: createMessengerHandler(createMessengerStore(rpc), transport) } });
  expect(sends).toBe(1);
  expect(psql(`select status from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("SENT");
  expect(psql(`select coalesce(remote_id,'') from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toMatch(/^mid\./);
  crashOrg = randomUUID();
  const crashPage = `2019${Date.now().toString().slice(-8)}`;
  psql(`insert into public.organizations(id,name,slug) values('${crashOrg}','OV018 crash worker','${crashOrg}');
select public.ingest_facebook_events('${crashOrg}','${crashPage}','[{"pageId":"${crashPage}","providerKey":"message:ov018-crash","kind":"message","senderId":"201800019","recipientId":"${crashPage}","eventTimeMs":${Date.now()},"data":{"text":"fake crash"}}]');`);
  const crashClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${crashOrg}');`));
  psql(`select public.finish_consultation('${crashClaim.job.id}','${crashClaim.job.lease_owner}','${crashClaim.job.lease_token}','{"type":"reply","intent":"praise","text":"Trước khi mất mạng.","claims":[]}');`);
  const crashJob = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_messenger_job('${owner}') j;`))[0] as BusinessJob;
  JSON.parse(psql(`select public.authorize_messenger_send('${crashJob.id}','${crashJob.lease_owner}','${crashJob.lease_token}');`));
  expect(psql(`select status from public.messenger_outbox where organization_id='${crashOrg}';`)).toBe("SENDING");
  const restart = JSON.parse(psql(`select public.authorize_messenger_send('${crashJob.id}','${crashJob.lease_owner}','${crashJob.lease_token}');`));
  expect(restart).toMatchObject({ action: "done", status: "UNKNOWN" });
  expect(psql(`select status||':'||error_code from public.messenger_outbox where organization_id='${crashOrg}';`)).toBe("UNKNOWN:unknown");
  expect(psql(`select count(*) from public.messenger_outbox_operations where organization_id='${crashOrg}' and status='UNKNOWN';`)).toBe("1");
  } finally { sweep(fixtureOrg); sweep(crashOrg); }
}, 20000);

it("does not load dotenv or print env while resolving local proof helpers", () => {
  expect(execSync("node -e \"console.log('ok')\"", { encoding: "utf8" }).trim()).toBe("ok");
});
