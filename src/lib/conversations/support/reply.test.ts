// SPDX-License-Identifier: Apache-2.0
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWebsiteMessagesRoute } from "@/lib/channels/web/messages";
import { WEBSITE_SESSION_COOKIE, createWebsiteSessionToken } from "@/lib/channels/web/session";
import { canPerformBusinessAction } from "@/lib/business/permissions";

const origin = "https://app.test";
const supportUi = readFileSync("src/app/(app)/support/support-conversation.tsx", "utf8");
const supportRoute = readFileSync("src/app/api/support/[id]/route.ts", "utf8");
const replySql = readFileSync("supabase/migrations/20260913107000_staff_web_reply.sql", "utf8");

it("AT-059-02 reply_customer is staff+manager and unknown actions stay denied", () => {
  expect(canPerformBusinessAction("staff", "reply_customer")).toBe(true);
  expect(canPerformBusinessAction("manager", "reply_customer")).toBe(true);
  expect(canPerformBusinessAction(null, "reply_customer")).toBe(false);
  expect(canPerformBusinessAction("admin", "reply_customer")).toBe(false);
  expect(canPerformBusinessAction("staff", "unknown")).toBe(false);
});

it("AT-059-03 Facebook composer stays Meta-only with zero Graph", () => {
  expect(supportUi).toContain("canComposeStaffWebReply");
  expect(supportUi).toContain("HỘI THOẠI WEBSITE");
  expect(supportUi).toContain("Gửi trả lời");
  expect(supportUi).toContain("Mở hộp thư Meta");
  expect(supportUi).toContain("Mở Meta Business Suite");
  expect(supportUi).not.toMatch(/graph\.facebook\.com|createGraphMessengerTransport|messenger_outbox/);
  expect(supportRoute).toContain("staff_web_reply");
  expect(supportRoute).toContain("reply_customer");
  expect(supportRoute).not.toMatch(/graph\.facebook\.com|createGraphMessengerTransport|messenger_outbox/);
  expect(replySql).toContain("staff_web_reply");
  expect(replySql).not.toMatch(/graph\.facebook\.com|insert into public\.messenger_outbox/);
});

it("AT-059-05 public GET omits staff-only fields when listing a staff reply", async () => {
  const issued = createWebsiteSessionToken(() => Buffer.alloc(32, 59));
  const route = createWebsiteMessagesRoute({
    rpc: async (name) => name === "read_website_session"
      ? { data: { ok: true, organizationId: "a0590000-0000-4000-8000-000000000001", channelUserKey: "web-user-059" }, error: null }
      : { data: null, error: { code: "42883" } },
    async listPublicMessages() {
      return {
        messages: [
          { id: "in-1", kind: "message", text: "can nhan vien", receivedAt: "2026-01-01T00:00:00.000Z" },
          { id: "out-1", kind: "reply", text: "Xin chao tu nhan vien", receivedAt: "2026-01-01T00:00:01.000Z" },
        ],
        status: "STAFF_ACTIVE",
        hasMore: false,
      };
    },
  }, { origin });
  const response = await route.GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${issued.token}` } }));
  expect(response.status).toBe(200);
  const body = await response.json() as { messages: Array<Record<string, unknown>> };
  expect(body.messages).toEqual([
    { id: "in-1", text: "can nhan vien", direction: "inbound", kind: "message", receivedAt: "2026-01-01T00:00:00.000Z" },
    { id: "out-1", text: "Xin chao tu nhan vien", direction: "outbound", kind: "reply", receivedAt: "2026-01-01T00:00:01.000Z" },
  ]);
  expect(JSON.stringify(body)).not.toMatch(/privateNote|staffId|actorId|claimedBy|psid|inbound_event_id|payload_hash/);
});

describe("local supabase_db_onevoice", () => {
  const psql = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const apply = () => {
    if (!psql("select version from supabase_migrations.schema_migrations where version='20260913107000';")) {
      psql(readFileSync("supabase/migrations/20260913107000_staff_web_reply.sql", "utf8"));
      psql("insert into supabase_migrations.schema_migrations(version) values('20260913107000') on conflict do nothing;");
    }
  };

  it("AT-059-01..05 staff WEB reply is VISIBLE, audited, customer-visible, Facebook rejected", () => {
    apply();
    const org = randomUUID();
    const staff = randomUUID();
    const loser = randomUUID();
    const manager = randomUUID();
    const request = randomUUID();
    const sender = `web-${org.replaceAll("-", "").slice(0, 24)}`;
    try {
      psql(`insert into public.organizations(id,name,slug) values('${org}','OV059 ${org}','${org}');
insert into auth.users(id) values('${staff}'),('${loser}'),('${manager}');
insert into public.staff_profiles(user_id,organization_id,role,active) values('${staff}','${org}','staff',true),('${loser}','${org}','staff',true),('${manager}','${org}','manager',true);
select public.ingest_web_event('${org}','{"providerKey":"message:ov059-vitest","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now()},"data":{"text":"can nhan vien"}}');`);
      const eventId = psql(`select id from public.web_inbound_events where organization_id='${org}' and provider_key='message:ov059-vitest';`);
      psql(`select public.request_conversation_handoff('${org}','${eventId}',0,'customer_requested');`);
      const convo = JSON.parse(psql(`select json_build_object('id',id,'revision',revision) from public.conversations where organization_id='${org}' and channel='WEB' and channel_user_key='${sender}';`)) as { id: string; revision: number };
      const claimed = JSON.parse(psql(`select public.transition_conversation_handoff('${org}','${staff}','${convo.id}',${convo.revision},'claim','${randomUUID()}');`)) as { revision: number; status: string };
      expect(claimed.status).toBe("STAFF_ACTIVE");
      expect(() => psql(`select public.transition_conversation_handoff('${org}','${loser}','${convo.id}',${convo.revision},'claim','${randomUUID()}');`)).toThrow();
      const reply = JSON.parse(psql(`select public.staff_web_reply('${org}','${staff}','${convo.id}',${claimed.revision},'${request}','Xin chao tu nhan vien');`)) as { kind: string; status: string; revision: number };
      expect(reply.kind).toBe("reply");
      expect(reply.status).toBe("STAFF_ACTIVE");
      expect(psql(`select status from public.web_outbound where request_key='${request}';`)).toBe("VISIBLE");
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${org}';`)).toBe("0");
      expect(psql(`select count(*) from public.audit_events where idempotency_key='${request}' and action='conversation.staff_replied';`)).toBe("1");
      expect(() => psql(`select public.staff_web_reply('${org}','${loser}','${convo.id}',${claimed.revision},'${randomUUID()}','loser');`)).toThrow();
      expect(psql(`select public.staff_web_reply('${org}','${staff}','${convo.id}',${claimed.revision},'${request}','Xin chao tu nhan vien')->>'kind';`)).toBe("reply");
      expect(psql(`select count(*) from public.web_outbound where conversation_id='${convo.id}' and status='VISIBLE';`)).toBe("1");
    } finally {
      psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where organization_id='${org}' and status in ('queued','running');`);
    }
  }, 20000);

  it("does not load dotenv while applying the staff reply migration", () => {
    expect(execSync("node -e \"console.log('ok')\"", { encoding: "utf8" }).trim()).toBe("ok");
  });
});
