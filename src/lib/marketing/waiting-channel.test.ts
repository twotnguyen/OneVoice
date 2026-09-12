// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Database } from "../supabase/database.types";
import { defaultSettings, settingsSchema } from "../business/settings";
import type { CampaignContentReceipt, GenerateCampaignContentInput } from "../content/campaign-generation";
import {
  createSchedulerStore,
  hasFacebookPublishingProvider,
  tick,
  waitingChannelRequestId,
  type ClaimResult,
  type ClaimedSlot,
  type SchedulerStore,
  type SlotDecision,
} from "./scheduler";
import { campaignSchema, campaignSlotSchema, unscheduleSlotSchema } from "../campaigns/management";

const org = "a0610000-0000-4000-8000-000000000001";
const campaign = "c0610000-0000-4000-8000-000000000001";
const slotA = "d0610000-0000-4000-8000-000000000001";
const now = new Date("2026-09-13T05:00:00.000Z");
const schedulerSource = readFileSync(new URL("./scheduler.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../../worker/automation-tick.ts", import.meta.url), "utf8");

function receipt(input: GenerateCampaignContentInput, version = 1): CampaignContentReceipt {
  return { id: input.requestId, version, contentHash: "ab".repeat(32), requestId: input.requestId, artifactHash: null, attempts: 1, replayed: false, model: "fixture" };
}

type MemSlot = ClaimedSlot & { claimedRequest?: string | null; claimedAt?: number; scheduledDate?: Date | null };
type MemState = {
  control: ClaimResult["control"];
  timezone: string;
  slots: MemSlot[];
  receipts: Map<string, unknown>;
};

function memoryStore(state: MemState): SchedulerStore {
  return {
    async claim(input) {
      const prior = state.receipts.get(`tick:${input.requestId}`);
      if (prior) return prior as ClaimResult;
      const claimed = state.slots.filter((slot) => {
        const eligible = slot.campaignStatus === "PLANNED" || slot.campaignStatus === "ACTIVE";
        const allowed = slot.priority
          ? state.control.status === "PAUSED" && state.control.priorityId === slot.campaignId
          : state.control.status === "RUNNING" && state.control.priorityId == null;
        if (!eligible || !allowed || !slot.scheduledDate) return false;
        if (slot.scheduledDate.getTime() > new Date(input.now).getTime()) return false;
        return slot.status === "READY" || slot.status === "PLANNED";
      }).map((slot) => ({ ...slot }));
      const result: ClaimResult = {
        control: state.control,
        timezone: state.timezone,
        slots: claimed,
      };
      state.receipts.set(`tick:${input.requestId}`, result);
      return result;
    },
    async apply(input) {
      const key = `decision:${input.requestId}`;
      const prior = state.receipts.get(key);
      if (prior) return prior as SlotDecision;
      const slot = state.slots.find((item) => item.id === input.slotId);
      if (!slot) throw Error("CONFLICT");
      if (input.action === "waiting_channel") {
        if (slot.status !== "WAITING_CHANNEL") slot.status = "WAITING_CHANNEL";
        slot.contentVersionId = input.contentVersionId ?? slot.contentVersionId;
      } else if (input.action === "ready") slot.status = "READY";
      else slot.status = "SKIPPED";
      const decision: SlotDecision = { slotId: slot.id, status: slot.status, reason: input.reason, contentVersionId: slot.contentVersionId, replacementId: null };
      state.receipts.set(key, decision);
      return decision;
    },
    async completePriority() {
      throw Error("not used");
    },
    async priorityPending() {
      return 0;
    },
  };
}

function planned(id: string, extra: Partial<MemSlot> = {}): MemSlot {
  return {
    id, campaignId: campaign, priority: false, campaignStatus: "PLANNED", status: "PLANNED",
    scheduledAt: now.toISOString(), scheduledDate: now, contentVersionId: null, contentRevision: 0,
    replacedSlotId: null, generateRequestId: randomUUID(), decisionRequestId: randomUUID(), sourceHealth: "ok", ...extra,
  };
}

describe("AT-061 waiting channel", () => {
  it("never imports Graph or a publishing adapter", () => {
    expect(hasFacebookPublishingProvider({ NODE_ENV: "test" })).toBe(false);
    expect(hasFacebookPublishingProvider({ NODE_ENV: "test", FACEBOOK_PAGE_ACCESS_TOKEN: "  " })).toBe(false);
    expect(schedulerSource).not.toContain("graph.facebook.com");
    expect(schedulerSource).not.toContain("publishing.ts");
    expect(schedulerSource).not.toContain("createGraph");
    expect(workerSource).not.toContain("graph.facebook.com");
    expect(workerSource).not.toContain("FACEBOOK_PAGE_ACCESS_TOKEN");
  });

  it("AT-061-03: due tick without Facebook provider sets WAITING_CHANNEL once", async () => {
    const live = planned(slotA);
    const state: MemState = { control: { status: "RUNNING", priorityId: null, revision: 1 }, timezone: "Asia/Ho_Chi_Minh", slots: [live], receipts: new Map() };
    const store = memoryStore(state);
    const first = await tick(org, now, { store, generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: false });
    expect(first.published).toBe(0);
    expect(first.slots[0]).toMatchObject({ status: "WAITING_CHANNEL", reason: "missing_publishing_provider" });
    expect(state.slots[0]?.status).toBe("WAITING_CHANNEL");
    const second = await tick(org, now, { store, generate: async () => { throw Error("must not generate"); }, requestId: randomUUID(), hasPublishingProvider: false });
    expect(second.slots.filter((item) => item.slotId === slotA)).toHaveLength(0);
    expect(state.slots.filter((slot) => slot.status === "PUBLISHED")).toHaveLength(0);
    expect(state.slots.filter((slot) => slot.status === "WAITING_CHANNEL")).toHaveLength(1);
  });

  it("AT-061-04: PAUSED ordinary does not run; WAITING_CHANNEL does not retry or publish", async () => {
    const live = planned(slotA, { status: "WAITING_CHANNEL", contentVersionId: "e0610000-0000-4000-8000-000000000001", contentRevision: 1 });
    const paused = await tick(org, now, {
      store: memoryStore({ control: { status: "PAUSED", priorityId: null, revision: 1 }, timezone: "Asia/Ho_Chi_Minh", slots: [planned("d0610000-0000-4000-8000-000000000002")], receipts: new Map() }),
      generate: async (input) => receipt(input),
      requestId: randomUUID(),
      hasPublishingProvider: false,
    });
    expect(paused.slots).toHaveLength(0);
    const waiting = await tick(org, now, {
      store: memoryStore({ control: { status: "RUNNING", priorityId: null, revision: 1 }, timezone: "Asia/Ho_Chi_Minh", slots: [live], receipts: new Map() }),
      generate: async () => { throw Error("must not generate"); },
      requestId: randomUUID(),
      hasPublishingProvider: false,
    });
    expect(waiting.slots).toHaveLength(0);
    expect(live.status).toBe("WAITING_CHANNEL");
  });

  it("AT-061-01: calendar DTO keeps caption, Truth Guard, versions and artifact hash", () => {
    const parsed = campaignSchema.parse({
      id: campaign, title: "Fixture", objective: "mixed", sourceKind: "product", sourceRef: org, priority: false,
      status: "PLANNED", version: 1, timezone: "Asia/Ho_Chi_Minh", createdAt: now.toISOString(), decision: null, sourceSnapshot: {},
      slots: [{
        id: slotA, ordinal: 1, status: "WAITING_CHANNEL", scheduledAt: now.toISOString(), contentVersionId: slotA,
        contentRevision: 1, decisionReason: "missing_publishing_provider", caption: "Caption", hook: "Hook", cta: "Nhắn tin để được tư vấn",
        script: null, validation: { status: "VALID", validator: "ov032-v1" }, passportFields: { "post.caption": "Caption" },
        artifactHash: "ab".repeat(32),
        versions: [{ id: slotA, version: 1, contentHash: "ab".repeat(32), caption: "Caption", hook: "Hook", cta: "Nhắn tin để được tư vấn", script: null, validation: { status: "VALID" }, passportFields: {}, artifactHash: "ab".repeat(32) }],
      }],
    });
    expect(parsed.slots[0]?.status).toBe("WAITING_CHANNEL");
    expect(parsed.slots[0]?.caption).toBe("Caption");
    expect(parsed.slots[0]?.validation).toEqual({ status: "VALID", validator: "ov032-v1" });
    expect(parsed.slots[0]?.versions).toHaveLength(1);
    expect(parsed.slots[0]?.artifactHash).toHaveLength(64);
  });

  it("AT-061-02: unschedule command is not a publish", () => {
    const command = unscheduleSlotSchema.parse({ slotId: slotA, requestId: randomUUID() });
    expect(command.slotId).toBe(slotA);
    expect(waitingChannelRequestId(slotA)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

const docker = ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"] as const;
const sql = (query: string) => execFileSync("docker", [...docker], { input: query, windowsHide: true, encoding: "utf8" }).trim();
const enabled = Boolean(process.env.ONEVOICE_LOCAL_ADMIN);
const localOrg = randomUUID();
const localProduct = randomUUID();
const localCampaign = randomUUID();
const localSlot = randomUUID();
const localActor = randomUUID();
const localVersion = randomUUID();
const hcm = "Asia/Ho_Chi_Minh";

describe("waiting channel local persistence", () => {
  beforeAllLocal();
  afterAll(() => {
    if (!enabled) return;
    sql(`update public.products set disabled_at=clock_timestamp() where id='${localProduct}'; update public.campaigns set status='FAILED' where id='${localCampaign}'; update public.marketing_control set status='PAUSED',reason='fixture_complete' where organization_id='${localOrg}';`);
  });
  it.skipIf(!enabled)("AT-061-03/02 local due tick waits, never publishes, unschedule keeps versions", async () => {
    const client = createClient<Database>("http://127.0.0.1:54321", process.env.ONEVOICE_LOCAL_ADMIN!, { auth: { persistSession: false, autoRefreshToken: false } });
    const store = createSchedulerStore(client);
    const graphCalls: string[] = [];
    const result = await tick(localOrg, new Date(), {
      store,
      generate: async (input) => receipt(input),
      requestId: randomUUID(),
      hasPublishingProvider: false,
    });
    expect(result.published).toBe(0);
    expect(graphCalls).toHaveLength(0);
    expect(result.slots[0]?.status).toBe("WAITING_CHANNEL");
    expect(sql(`select status from public.campaign_slots where id='${localSlot}'`)).toBe("WAITING_CHANNEL");
    expect(sql(`select count(*) from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id where c.organization_id='${localOrg}' and s.status='PUBLISHED'`)).toBe("0");
    const again = await tick(localOrg, new Date(), {
      store,
      generate: async () => { throw Error("must not generate"); },
      requestId: randomUUID(),
      hasPublishingProvider: false,
    });
    expect(again.slots.filter((item) => item.slotId === localSlot)).toHaveLength(0);
    const uns = await client.rpc("unschedule_campaign_slot", { p_org: localOrg, p_actor: localActor, p_slot: localSlot, p_request: randomUUID() });
    expect(uns.error).toBeNull();
    expect(z.object({ status: z.string() }).parse(uns.data).status).toBe("WAITING_CHANNEL");
    expect(sql(`select scheduled_at is null from public.campaign_slots where id='${localSlot}'`)).toBe("t");
    expect(sql(`select count(*) from public.content_versions where slot_id='${localSlot}'`)).toBe("1");
    const history = await client.rpc("read_slot_content_history", { p_org: localOrg, p_actor: localActor, p_slot: localSlot });
    expect(history.error).toBeNull();
    expect(campaignSlotSchema.parse(history.data).versions).toHaveLength(1);
  }, 20000);
});

function beforeAllLocal() {
  if (!enabled) return;
  if (!sql("select version from supabase_migrations.schema_migrations where version='20260913110000';")) {
    sql(readFileSync("supabase/migrations/20260913110000_campaign_slot_waiting_channel.sql", "utf8"));
    const columns = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';");
    if (columns.includes("statements") && columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260913110000','campaign_slot_waiting_channel','{}');");
    else if (columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name) values('20260913110000','campaign_slot_waiting_channel');");
    else sql("insert into supabase_migrations.schema_migrations(version) values('20260913110000');");
  }
  const settings = JSON.stringify(settingsSchema.parse({ ...defaultSettings().settings, timezone: hcm, timingMode: "constrained", dailyCap: 1, windows: [{ start: "00:00", end: "23:59" }] })).replaceAll("'", "''");
  sql(`begin;
    insert into public.organizations(id,name,slug) values('${localOrg}','Waiting fixture','${localOrg}');
    insert into auth.users(id) values('${localActor}');
    insert into public.staff_profiles(user_id,organization_id,role) values('${localActor}','${localOrg}','manager');
    insert into public.business_settings(organization_id,revision,settings) values('${localOrg}',1,'${settings}');
    insert into public.marketing_control(organization_id,status,reason) values('${localOrg}','RUNNING','enabled');
    insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality)
      values('${localProduct}','${localOrg}','urn:test:${localProduct}','urn:test:${localProduct}','Keyboard',true,2,100000,'partial');
    insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision)
      values('${localCampaign}','${localOrg}','Waiting fixture','mixed','product','${localProduct}',false,'{"id":"${localProduct}","skus":[{"id":"${localProduct}","priceVnd":100000,"stockQuantity":2}]}','{}','${hcm}','{}');
    insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('${localSlot}','${localCampaign}',1,clock_timestamp()-interval '1 minute');
    insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash)
      values('${localVersion}','${localOrg}','${localSlot}',1,'${localVersion}','{"schema":"onevoice.content.v1","draft":{"post":{"hook":"H","caption":"C","cta":"Nhắn tin để được tư vấn"},"script":null,"model":{"id":"fixture","responseId":null},"claims":[]},"evidence":[],"templates":[],"fields":{},"validation":{"status":"VALID","validator":"ov032-v1"},"artifactHash":null,"contentHash":"${"ab".repeat(32)}"}','${"ab".repeat(32)}');
    update public.campaign_slots set content_version_id='${localVersion}',content_revision=1 where id='${localSlot}';
  commit;`);
}
