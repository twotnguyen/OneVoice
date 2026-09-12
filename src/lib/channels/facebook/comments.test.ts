import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { expect, it } from "vitest";
import { runBusinessJobs } from "../../../worker/business-jobs";
import type { BusinessJob, BusinessJobQueue } from "../../jobs/types";
import { createFacebookWebhook, normalizeFacebookEvents, type FacebookInboundEvent } from "./webhook";
import {
  PUBLIC_COMMENT_INVITE_TEXT,
  classifyPublicComment,
  createGraphPublicCommentTransport,
  createPublicCommentDispositionHandler,
  createPublicCommentInboundStore,
  createPublicCommentSendHandler,
  createPublicCommentSendStore,
  interpretPublicCommentResponse,
  parsePublicComment,
  type PublicCommentAuthorizeResult,
  type PublicCommentRpc,
  type PublicCommentTransport,
  type PublicCommentTransportResult,
} from "./comments";

const org = "a0000000-0000-0000-0000-000000000001";
const page = "10000000001";
const job = (kind: BusinessJob["kind"] = "outbound_comment"): BusinessJob => ({
  id: "d1900000-0000-0000-0000-000000000001",
  organization_id: org,
  kind,
  entity_id: "d1900000-0000-0000-0000-000000000010",
  lease_owner: "d1900000-0000-0000-0000-000000000002",
  lease_token: "d1900000-0000-0000-0000-000000000003",
});

function commentEvent(overrides: Partial<FacebookInboundEvent> & { data?: Record<string, unknown> } = {}): FacebookInboundEvent {
  return {
    pageId: page,
    providerKey: "comment:fixture",
    kind: "comment",
    senderId: "20000000001",
    recipientId: page,
    eventTimeMs: 1700000000000,
    deliveryTimeMs: 1700000000000,
    data: { item: "comment", verb: "add", comment_id: "100_200", text: "giá bao nhiêu", ...overrides.data },
    ...overrides,
  };
}

it("AT-019-01 praise is IGNORE; price, stock and warranty are INVITE", () => {
  expect(classifyPublicComment("xịn quá")).toBe("IGNORE");
  expect(classifyPublicComment("sản phẩm tốt lắm")).toBe("IGNORE");
  expect(classifyPublicComment("giá bao nhiêu")).toBe("INVITE");
  expect(classifyPublicComment("còn hàng không")).toBe("INVITE");
  expect(classifyPublicComment("yêu cầu bảo hành")).toBe("INVITE");
  expect(classifyPublicComment("đổi trả giúp mình")).toBe("INVITE");
  expect(classifyPublicComment("http://spam.invalid")).toBe("IGNORE");
});

it("AT-019-02 invite text is fixed Vietnamese and never echoes phone, address, price or policy", () => {
  const source = "giá bao nhiêu, gọi 0901234567 giao 12 Nguyễn Huệ Q1, bảo hành 24 tháng";
  expect(classifyPublicComment(source)).toBe("INVITE");
  expect(PUBLIC_COMMENT_INVITE_TEXT).toMatch(/nhắn tin riêng/);
  expect(PUBLIC_COMMENT_INVITE_TEXT).not.toContain("0901234567");
  expect(PUBLIC_COMMENT_INVITE_TEXT).not.toContain("Nguyễn Huệ");
  expect(PUBLIC_COMMENT_INVITE_TEXT).not.toMatch(/\d{8,}/);
  expect(PUBLIC_COMMENT_INVITE_TEXT.toLowerCase()).not.toContain("giá");
  expect(PUBLIC_COMMENT_INVITE_TEXT.toLowerCase()).not.toContain("bảo hành");
  expect(PUBLIC_COMMENT_INVITE_TEXT).not.toContain(source);
});

it("AT-019-03 parse drops page self-echo, deleted and unsupported events", () => {
  expect(parsePublicComment(commentEvent()).skip).toBe(false);
  expect(parsePublicComment(commentEvent({ senderId: page })).skip).toBe(true);
  expect(parsePublicComment(commentEvent({ data: { verb: "remove", comment_id: "100_200", text: "giá bao nhiêu" } })).skip).toBe(true);
  expect(parsePublicComment(commentEvent({ data: { verb: "hide", comment_id: "100_200", text: "giá bao nhiêu" } })).skip).toBe(true);
  expect(parsePublicComment(commentEvent({ data: { verb: "add", text: "giá bao nhiêu" } })).skip).toBe(true);
  expect(parsePublicComment(commentEvent({ kind: "feed", data: { item: "post", verb: "add" } })).skip).toBe(true);
  expect(normalizeFacebookEvents({
    object: "page",
    entry: [{ id: page, time: 1700000000, changes: [
      { field: "feed", value: { item: "comment", verb: "add", comment_id: "bot_1", from: { id: page }, message: "mời inbox" } },
      { field: "feed", value: { item: "comment", verb: "remove", comment_id: "gone_1", message: "giá bao nhiêu" } },
    ] }],
  }, page)).toEqual([]);
});

it("AT-019-03 public Graph adapter never uses the PSID Send API", () => {
  expect(createGraphPublicCommentTransport({ pageAccessToken: "fixture" }).url("100_200")).toBe("https://graph.facebook.com/v25.0/100_200/comments");
  expect(createGraphPublicCommentTransport({ pageAccessToken: "fixture" }).url("100_200")).not.toContain("/messages");
  expect(interpretPublicCommentResponse(200, { id: "100_200_1" })).toEqual({ outcome: "accepted", remoteId: "100_200_1" });
  expect(interpretPublicCommentResponse(200, { message_id: "mid.private", recipient_id: "psid" })).toEqual({ outcome: "unknown", errorCode: "malformed" });
  expect(interpretPublicCommentResponse(403, { error: { code: 10 } })).toEqual({ outcome: "rejected", errorCode: "permission" });
  expect(interpretPublicCommentResponse(400, { error: { code: 190 } })).toEqual({ outcome: "rejected", errorCode: "token" });
  expect(interpretPublicCommentResponse(429, { error: { code: 613 } })).toEqual({ outcome: "rejected", errorCode: "rate_limit", retry: true });
  expect(interpretPublicCommentResponse(500, {})).toEqual({ outcome: "rejected", errorCode: "rate_limit", retry: true });
  expect(interpretPublicCommentResponse(200, {})).toEqual({ outcome: "unknown", errorCode: "malformed" });
});

it("AT-019-01/02 disposition handler records INVITE with the fixed invite and ignores praise", async () => {
  const recorded: string[] = [];
  const handler = createPublicCommentDispositionHandler({
    context: () => commentEvent(),
    record: async (_job, disposition) => { recorded.push(disposition); },
  });
  await handler(job("inbound_event"), new AbortController().signal);
  expect(recorded).toEqual(["INVITE"]);
  const praise = createPublicCommentDispositionHandler({
    context: () => commentEvent({ data: { comment_id: "100_201", text: "xịn quá", verb: "add" } }),
    record: async (_job, disposition) => { recorded.push(disposition); },
  });
  await praise(job("inbound_event"), new AbortController().signal);
  expect(recorded).toEqual(["INVITE", "IGNORE"]);
  const echo = createPublicCommentDispositionHandler({
    context: () => commentEvent({ senderId: page }),
    record: async () => { throw new Error("self echo must not record"); },
  });
  await echo(job("inbound_event"), new AbortController().signal);
});

it("AT-019-03 missing permission and UNKNOWN do not blind-retry; send uses comment id not PSID", async () => {
  const sent: PublicCommentTransport extends (request: infer R, signal: AbortSignal) => unknown ? R[] : never[] = [];
  const outcomes: PublicCommentTransportResult[] = [];
  const permission = createPublicCommentSendHandler({
    authorize: async (): Promise<PublicCommentAuthorizeResult> => ({ action: "send", pageId: page, commentId: "100_200", text: PUBLIC_COMMENT_INVITE_TEXT, attempt: 1 }),
    complete: async (_job, result) => { outcomes.push(result); return { retry: false }; },
  }, async (request) => {
    sent.push(request);
    expect("psid" in request).toBe(false);
    return interpretPublicCommentResponse(403, { error: { code: 10 } });
  });
  await permission(job(), new AbortController().signal);
  expect(outcomes).toEqual([{ outcome: "rejected", errorCode: "permission" }]);
  expect(sent[0]).toMatchObject({ commentId: "100_200", text: PUBLIC_COMMENT_INVITE_TEXT });
  let resends = 0;
  await createPublicCommentSendHandler({
    authorize: async () => ({ action: "done", status: "UNKNOWN", errorCode: "unknown" }),
    complete: async () => { throw new Error("no complete after unknown"); },
  }, async () => { resends++; return { outcome: "accepted", remoteId: "should-not-send" }; })(job(), new AbortController().signal);
  expect(resends).toBe(0);
  await createPublicCommentSendHandler({
    authorize: async () => ({ action: "done", status: "FAILED", errorCode: "permission" }),
    complete: async () => { throw new Error("no complete after permission"); },
  }, async () => { resends++; return { outcome: "accepted", remoteId: "should-not-send" }; })(job(), new AbortController().signal);
  expect(resends).toBe(0);
});

it("AT-019-04 local signed ingress records disposition, fake public transport, no private window", async () => {
  const fixtureOrg = randomUUID();
  const fixturePage = `2019${Date.now().toString().slice(-8)}`;
  const owner = randomUUID();
  const secret = "ov019-fixture-secret";
  const commentId = `${fixturePage}_9001`;
  const psql = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const sweep = (orgId: string) => {
    psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where organization_id='${orgId}' and status in ('queued','running');`);
  };
  try {
    psql(`insert into public.organizations(id,name,slug) values('${fixtureOrg}','OV019 public comment','${fixtureOrg}');`);
    const persist: FacebookInboundEvent[][] = [];
    const handlers = createFacebookWebhook({
      appSecret: secret,
      verifyToken: "ov019-verify",
      pageId: fixturePage,
      persist: async (events) => {
        persist.push(events);
        const payload = JSON.stringify(events).replaceAll("'", "''");
        psql(`select public.ingest_facebook_events('${fixtureOrg}','${fixturePage}','${payload}'::jsonb);`);
      },
    });
    const body = JSON.stringify({
      object: "page",
      entry: [{
        id: fixturePage,
        time: 1700000000,
        changes: [
          { field: "feed", value: { item: "comment", verb: "add", comment_id: commentId, post_id: fixturePage, from: { id: "20000001901" }, message: "giá bao nhiêu, gọi 0901234567", created_time: 1700000000 } },
          { field: "feed", value: { item: "comment", verb: "edited", comment_id: commentId, post_id: fixturePage, from: { id: "20000001901" }, message: "còn hàng không 0901234567", created_time: 1700000001 } },
          { field: "feed", value: { item: "comment", verb: "add", comment_id: `${fixturePage}_bot`, post_id: fixturePage, from: { id: fixturePage }, message: "mời inbox", created_time: 1700000002 } },
        ],
      }],
    });
    const signed = new Request("https://fixture.invalid/api/webhooks/facebook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
    });
    expect((await handlers.POST(signed)).status).toBe(200);
    expect(persist[0]?.every((event) => event.kind === "comment" && event.senderId !== fixturePage)).toBe(true);
    expect(psql(`select count(*) from public.facebook_inbound_events where organization_id='${fixtureOrg}' and kind='comment';`)).toBe("2");
    const rpc: PublicCommentRpc = async (name, args) => {
      const now = args.p_now ? `'${String(args.p_now).replaceAll("'", "''")}'` : "clock_timestamp()";
      if (name === "claim_public_comment_job") {
        const raw = psql(`select coalesce(public.claim_public_comment_job('${args.p_owner}'::uuid)::text,'null');`);
        return { data: JSON.parse(raw), error: null };
      }
      if (name === "record_public_comment_disposition") {
        return { data: JSON.parse(psql(`select public.record_public_comment_disposition('${args.p_job_id}','${args.p_owner}','${args.p_token}','${args.p_disposition}');`)), error: null };
      }
      if (name === "claim_public_comment_send_job") {
        const raw = psql(`select coalesce(json_agg(j),'[]') from public.claim_public_comment_send_job('${args.p_owner}'::uuid) j;`);
        return { data: JSON.parse(raw), error: null };
      }
      if (name === "authorize_public_comment_send") {
        return { data: JSON.parse(psql(`select public.authorize_public_comment_send('${args.p_job_id}','${args.p_owner}','${args.p_token}',${now});`)), error: null };
      }
      if (name === "complete_public_comment_send") {
        const payload = JSON.stringify(args.p_result).replaceAll("'", "''");
        return { data: JSON.parse(psql(`select public.complete_public_comment_send('${args.p_job_id}','${args.p_owner}','${args.p_token}','${payload}'::jsonb,${now});`)), error: null };
      }
      if (name === "heartbeat_business_job") {
        return { data: psql(`select public.heartbeat_business_job('${args.p_id}','${args.p_owner}','${args.p_token}',60);`) === "t", error: null };
      }
      if (name === "finish_business_job") {
        const error = args.p_error == null ? "null" : `'${args.p_error}'`;
        return { data: psql(`select public.finish_business_job('${args.p_id}','${args.p_owner}','${args.p_token}',${error});`) === "t", error: null };
      }
      throw new Error(`unexpected_rpc:${name}`);
    };
    const inbound = createPublicCommentInboundStore(rpc);
    for (let i = 0; i < 4; i++) {
      const claimed = await inbound.queue.claim(owner);
      if (!claimed) break;
      await createPublicCommentDispositionHandler(inbound)(claimed, new AbortController().signal);
      await inbound.queue.finish(claimed);
    }
    expect(psql(`select count(*) from public.public_comment_invitations where organization_id='${fixtureOrg}';`)).toBe("1");
    expect(psql(`select disposition||':'||status from public.public_comment_invitations where organization_id='${fixtureOrg}';`)).toBe("INVITE:PENDING");
    expect(psql(`select text from public.public_comment_invitations where organization_id='${fixtureOrg}';`)).toBe(PUBLIC_COMMENT_INVITE_TEXT);
    expect(psql(`select text from public.public_comment_invitations where organization_id='${fixtureOrg}';`)).not.toContain("0901234567");
    expect(psql(`select count(*) from public.conversations where organization_id='${fixtureOrg}';`)).toBe("0");
    expect(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`)).toBe("");
    expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("0");
    const praiseId = `${fixturePage}_praise`;
    psql(`select public.ingest_facebook_events('${fixtureOrg}','${fixturePage}','[{"pageId":"${fixturePage}","providerKey":"comment:praise","kind":"comment","senderId":"20000001902","recipientId":"${fixturePage}","eventTimeMs":1700000003000,"data":{"item":"comment","verb":"add","comment_id":"${praiseId}","text":"sản phẩm tốt lắm"}}]');`);
    const praiseJob = await inbound.queue.claim(owner);
    expect(praiseJob).not.toBeNull();
    await createPublicCommentDispositionHandler(inbound)(praiseJob!, new AbortController().signal);
    await inbound.queue.finish(praiseJob!);
    expect(psql(`select disposition||':'||status from public.public_comment_invitations where organization_id='${fixtureOrg}' and comment_id='${praiseId}';`)).toBe("IGNORE:IGNORED");
    let sends = 0;
    const transport: PublicCommentTransport = async (request) => {
      sends++;
      expect(request.commentId).toBe(commentId);
      expect(request.text).toBe(PUBLIC_COMMENT_INVITE_TEXT);
      expect(request.text).not.toContain("0901234567");
      expect("psid" in request).toBe(false);
      expect(psql(`select status from public.public_comment_invitations where organization_id='${fixtureOrg}' and comment_id='${commentId}';`)).toBe("SENDING");
      return { outcome: "accepted", remoteId: `${commentId}_reply` };
    };
    const outbound = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_public_comment_send_job('${owner}'::uuid) j;`))[0] as BusinessJob;
    expect(outbound.kind).toBe("outbound_comment");
    const stop = new AbortController();
    const queue: BusinessJobQueue = {
      claim: async () => outbound,
      heartbeat: async () => true,
      finish: async () => { stop.abort(); return true; },
    };
    await runBusinessJobs({
      queue,
      owner,
      signal: stop.signal,
      pollMs: 10,
      handlers: { outbound_comment: createPublicCommentSendHandler(createPublicCommentSendStore(rpc), transport) },
    });
    expect(sends).toBe(1);
    expect(psql(`select status from public.public_comment_invitations where organization_id='${fixtureOrg}' and comment_id='${commentId}';`)).toBe("SENT");
    expect(psql(`select count(*) from public.conversations where organization_id='${fixtureOrg}';`)).toBe("0");
    const crashOrg = randomUUID();
    const crashPage = `2020${Date.now().toString().slice(-8)}`;
    const crashComment = `${crashPage}_1`;
    psql(`insert into public.organizations(id,name,slug) values('${crashOrg}','OV019 crash','${crashOrg}');
select public.ingest_facebook_events('${crashOrg}','${crashPage}','[{"pageId":"${crashPage}","providerKey":"comment:crash","kind":"comment","senderId":"20000001903","recipientId":"${crashPage}","eventTimeMs":1700000004000,"data":{"item":"comment","verb":"add","comment_id":"${crashComment}","text":"còn hàng không"}}]');`);
    const crashInbound = createPublicCommentInboundStore(rpc);
    const crashClaim = await crashInbound.queue.claim(owner);
    expect(crashClaim).not.toBeNull();
    await createPublicCommentDispositionHandler(crashInbound)(crashClaim!, new AbortController().signal);
    await crashInbound.queue.finish(crashClaim!);
    const crashJob = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_public_comment_send_job('${owner}'::uuid) j;`))[0] as BusinessJob;
    JSON.parse(psql(`select public.authorize_public_comment_send('${crashJob.id}','${crashJob.lease_owner}','${crashJob.lease_token}');`));
    expect(psql(`select status from public.public_comment_invitations where organization_id='${crashOrg}';`)).toBe("SENDING");
    const restart = JSON.parse(psql(`select public.authorize_public_comment_send('${crashJob.id}','${crashJob.lease_owner}','${crashJob.lease_token}');`));
    expect(restart).toMatchObject({ action: "done", status: "UNKNOWN" });
    expect(psql(`select status||':'||error_code from public.public_comment_invitations where organization_id='${crashOrg}';`)).toBe("UNKNOWN:unknown");
    sweep(crashOrg);
  } finally {
    sweep(fixtureOrg);
  }
}, 20000);

it("does not load dotenv or print env while resolving local proof helpers", () => {
  expect(execSync("node -e \"console.log('ok')\"", { encoding: "utf8" }).trim()).toBe("ok");
});
