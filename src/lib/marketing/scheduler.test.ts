// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { CampaignContentReceipt, GenerateCampaignContentInput } from "../content/campaign-generation";
import { defaultSettings, settingsSchema } from "../business/settings";
import {
  classifySource,
  createSchedulerStore,
  localDayKey,
  nextSlotInstants,
  tick,
  timingPolicy,
  type ClaimResult,
  type ClaimedSlot,
  type SchedulerStore,
  type SlotDecision,
  type SourceHealth,
} from "./scheduler";

const org = "a0360000-0000-4000-8000-000000000001";
const campaign = "c0360000-0000-4000-8000-000000000001";
const slotA = "d0360000-0000-4000-8000-000000000001";
const slotB = "d0360000-0000-4000-8000-000000000002";
const hcm = "Asia/Ho_Chi_Minh";

function receipt(input: GenerateCampaignContentInput, version = 1): CampaignContentReceipt {
  return { id: input.requestId, version, contentHash: "ab".repeat(32), requestId: input.requestId, artifactHash: null, attempts: 1, replayed: false, model: "fixture" };
}

type MemSlot = ClaimedSlot & { claimedRequest?: string | null; claimedAt?: number; scheduledDate?: Date | null; isReplacement?: boolean; reason?: string };
type MemState = {
  control: ClaimResult["control"];
  timezone: string;
  timingMode: "auto" | "constrained";
  dailyCap: number;
  windows: { start: string; end: string }[];
  slots: MemSlot[];
  receipts: Map<string, unknown>;
  content: Map<string, string>;
};

function memoryStore(state: MemState): SchedulerStore {
  let gate = Promise.resolve();
  const exclusive = async <T>(fn: () => T | Promise<T>) => {
    const run = gate.then(fn, fn);
    gate = run.then(() => undefined, () => undefined);
    return run;
  };
  const healthOf = (slot: MemSlot): SourceHealth => slot.sourceHealth;
  return {
    async claim(input) {
      return exclusive(() => {
        const prior = state.receipts.get(`tick:${input.requestId}`);
        if (prior) return prior as ClaimResult;
        if (input.expectedRevision != null && input.expectedRevision !== state.control.revision) throw Error("CONFLICT");
        const now = new Date(input.now);
        const policy = timingPolicy({ timingMode: state.timingMode, dailyCap: state.dailyCap, windows: state.windows });
        const today = localDayKey(now, state.timezone);
        for (const slot of state.slots) {
          if (slot.status !== "PLANNED" || !slot.scheduledDate) continue;
          if (localDayKey(slot.scheduledDate, state.timezone) < today) {
            slot.status = "SKIPPED";
            slot.reason = "missed_window";
            if (!slot.replacedSlotId && !state.slots.some((item) => item.replacedSlotId === slot.id)) {
              const id = randomUUID();
              state.slots.push({
                id, campaignId: slot.campaignId, priority: slot.priority, campaignStatus: slot.campaignStatus, status: "PLANNED",
                scheduledAt: null, scheduledDate: null, contentVersionId: null, contentRevision: 0, replacedSlotId: slot.id,
                generateRequestId: randomUUID(), decisionRequestId: randomUUID(), sourceHealth: "ok",
              });
            }
          }
        }
        const reserved = state.slots.filter((slot) => slot.scheduledDate && slot.status !== "SKIPPED" && slot.status !== "FAILED").map((slot) => slot.scheduledDate!);
        const unscheduled = state.slots.filter((slot) => slot.status === "PLANNED" && !slot.scheduledDate);
        const instants = nextSlotInstants({ timeZone: state.timezone, now, dailyCap: policy.dailyCap, windows: policy.windows, reserved, count: unscheduled.length });
        unscheduled.forEach((slot, index) => {
          const instant = instants[index];
          if (!instant) return;
          slot.scheduledDate = instant;
          slot.scheduledAt = instant.toISOString();
        });
        const claimed: ClaimedSlot[] = [];
        for (const slot of state.slots) {
          const eligible = slot.campaignStatus === "PLANNED" || slot.campaignStatus === "ACTIVE";
          const allowed = slot.priority
            ? state.control.status === "PAUSED" && state.control.priorityId === slot.campaignId
            : state.control.status === "RUNNING" && state.control.priorityId == null;
          if (!eligible || !allowed || !slot.scheduledDate) continue;
          if (localDayKey(slot.scheduledDate, state.timezone) !== today) continue;
          if (slot.scheduledDate.getTime() > now.getTime()) continue;
          if (slot.status === "READY") { claimed.push({ ...slot, sourceHealth: healthOf(slot) }); continue; }
          if (slot.status !== "PLANNED") continue;
          const fresh = !slot.claimedRequest || slot.claimedRequest === input.requestId || (slot.claimedAt ?? 0) < now.getTime() - 120000;
          if (!fresh) continue;
          slot.claimedRequest = input.requestId;
          slot.claimedAt = now.getTime();
          if (state.content.has(slot.id) && !slot.contentVersionId) {
            slot.contentVersionId = state.content.get(slot.id) ?? null;
            slot.contentRevision = 1;
          }
          claimed.push({ ...slot, sourceHealth: healthOf(slot) });
        }
        const result: ClaimResult = {
          control: state.control,
          timezone: state.timezone,
          slots: claimed,
        };
        state.receipts.set(`tick:${input.requestId}`, result);
        return result;
      });
    },
    async apply(input) {
      return exclusive(() => {
        const key = `decision:${input.requestId}`;
        const prior = state.receipts.get(key);
        if (prior) return prior as SlotDecision;
        if (input.expectedRevision !== state.control.revision) throw Error("CONFLICT");
        const slot = state.slots.find((item) => item.id === input.slotId);
        if (!slot || slot.campaignStatus === "COMPLETED" || slot.campaignStatus === "FAILED") throw Error("CONFLICT");
        if (input.action === "ready") {
          slot.status = "READY";
          slot.contentVersionId = input.contentVersionId ?? slot.contentVersionId;
        } else {
          slot.status = "SKIPPED";
        }
        slot.claimedRequest = null;
        let replacementId: string | null = null;
        if (input.action === "skipped" && input.replace && !slot.replacedSlotId && !state.slots.some((item) => item.replacedSlotId === slot.id)) {
          replacementId = randomUUID();
          state.slots.push({
            id: replacementId, campaignId: slot.campaignId, priority: slot.priority, campaignStatus: slot.campaignStatus, status: "PLANNED",
            scheduledAt: null, scheduledDate: null, contentVersionId: null, contentRevision: 0, replacedSlotId: slot.id,
            generateRequestId: randomUUID(), decisionRequestId: randomUUID(), sourceHealth: "ok",
          });
        }
        const decision: SlotDecision = { slotId: slot.id, status: slot.status, reason: input.reason, contentVersionId: slot.contentVersionId, replacementId };
        state.receipts.set(key, decision);
        return decision;
      });
    },
    async completePriority(input) {
      return exclusive(() => {
        const key = `priority:${input.requestId}`;
        const prior = state.receipts.get(key);
        if (prior) return prior as { status: "PAUSED"; priorityId: null; revision: number };
        if (state.control.revision !== input.expectedRevision || state.control.priorityId !== input.campaignId) throw Error("CONFLICT");
        state.control = { status: "PAUSED", priorityId: null, revision: state.control.revision + 1 };
        const result = { status: "PAUSED" as const, priorityId: null, revision: state.control.revision };
        state.receipts.set(key, result);
        return result;
      });
    },
    async priorityPending(_organizationId, campaignId) {
      return state.slots.filter((slot) => slot.campaignId === campaignId && (slot.status === "PLANNED" || slot.status === "CLAIMED")).length;
    },
  };
}

function baseState(overrides: Partial<MemState> = {}): MemState {
  return {
    control: { status: "RUNNING", priorityId: null, revision: 1 },
    timezone: hcm,
    timingMode: "constrained",
    dailyCap: 1,
    windows: [{ start: "09:00", end: "17:00" }],
    slots: [],
    receipts: new Map(),
    content: new Map(),
    ...overrides,
  };
}

function planned(id: string, scheduled: Date | null, extra: Partial<MemSlot> = {}): MemSlot {
  return {
    id, campaignId: campaign, priority: false, campaignStatus: "PLANNED", status: "PLANNED",
    scheduledAt: scheduled?.toISOString() ?? null, scheduledDate: scheduled, contentVersionId: null, contentRevision: 0,
    replacedSlotId: null, generateRequestId: randomUUID(), decisionRequestId: randomUUID(), sourceHealth: "ok", ...extra,
  };
}

describe("timezone windows and caps", () => {
  it("AT-036-01: midnight in business timezone splits the daily cap", () => {
    const before = new Date("2026-09-12T16:59:00.000Z");
    const after = new Date("2026-09-12T17:00:00.000Z");
    expect(localDayKey(before, hcm)).toBe("2026-09-12");
    expect(localDayKey(after, hcm)).toBe("2026-09-13");
    const policy = timingPolicy({ timingMode: "constrained", dailyCap: 1, windows: [{ start: "09:00", end: "17:00" }] });
    const first = nextSlotInstants({ timeZone: hcm, now: before, dailyCap: policy.dailyCap, windows: policy.windows, reserved: [], count: 1 });
    expect(first).toHaveLength(1);
    expect(localDayKey(first[0]!, hcm)).toBe("2026-09-13");
    const sameDay = nextSlotInstants({ timeZone: hcm, now: after, dailyCap: 1, windows: policy.windows, reserved: [], count: 1 });
    expect(localDayKey(sameDay[0]!, hcm)).toBe("2026-09-13");
    const overflow = nextSlotInstants({ timeZone: hcm, now: after, dailyCap: 1, windows: policy.windows, reserved: sameDay, count: 1 });
    expect(localDayKey(overflow[0]!, hcm)).toBe("2026-09-14");
  });
  it("AT-036-01: DST spring-forward keeps one local calendar day", () => {
    const est = new Date("2026-03-08T06:59:00.000Z");
    const edt = new Date("2026-03-08T07:00:00.000Z");
    expect(localDayKey(est, "America/New_York")).toBe("2026-03-08");
    expect(localDayKey(edt, "America/New_York")).toBe("2026-03-08");
  });
  it("auto timing uses bounded technical defaults, not manager windows", () => {
    const policy = timingPolicy({ timingMode: "auto", dailyCap: 30, windows: [{ start: "00:00", end: "23:59" }] });
    expect(policy.dailyCap).toBe(1);
    expect(policy.windows[0]?.start).toBe("10:00");
  });
});

describe("source classification", () => {
  it("AT-036-03: stock/promo stale vs price change", () => {
    const snapshot = { skus: [{ id: "s", priceVnd: 100000 }] };
    expect(classifySource("product", snapshot, { error: "stale" })).toBe("stale_stock");
    expect(classifySource("program", snapshot, { error: "expired" })).toBe("expired_promo");
    expect(classifySource("product", snapshot, { skus: [{ id: "s", priceVnd: 120000 }] })).toBe("price_changed");
    expect(classifySource("product", snapshot, snapshot)).toBe("ok");
  });
});

describe("tick", () => {
  const now = new Date("2026-09-13T05:00:00.000Z");

  it("AT-036-01: two concurrent ticks do not duplicate a due slot or breach daily cap", async () => {
    const state = baseState({ slots: [planned(slotA, null), planned(slotB, null)] });
    const store = memoryStore(state);
    const generates: string[] = [];
    const generate = async (input: GenerateCampaignContentInput) => {
      generates.push(input.slotId);
      return receipt(input);
    };
    const [left, right] = await Promise.all([
      tick(org, now, { store, generate, requestId: randomUUID(), hasPublishingProvider: true }),
      tick(org, now, { store, generate, requestId: randomUUID(), hasPublishingProvider: true }),
    ]);
    expect(left.published).toBe(0);
    expect(right.published).toBe(0);
    const ready = [...left.slots, ...right.slots].filter((item) => item.status === "READY");
    expect(new Set(ready.map((item) => item.slotId)).size).toBe(1);
    expect(state.slots.filter((slot) => slot.status === "READY")).toHaveLength(1);
    expect(new Set(generates)).toHaveLength(1);
    const today = state.slots.filter((slot) => slot.scheduledDate && localDayKey(slot.scheduledDate, hcm) === localDayKey(now, hcm) && slot.status !== "SKIPPED");
    expect(today.length).toBeLessThanOrEqual(1);
    expect(state.slots.some((slot) => slot.status === "PUBLISHED")).toBe(false);
  });

  it("AT-036-02: PAUSED blocks ordinary; matching priority runs; completing stays PAUSED", async () => {
    const ordinary = planned(slotA, now, { campaignId: campaign, priority: false });
    const priorityId = "c0360000-0000-4000-8000-000000000099";
    const prioritySlot = planned(slotB, now, { campaignId: priorityId, priority: true });
    const paused = baseState({ control: { status: "PAUSED", priorityId, revision: 2 }, slots: [ordinary, prioritySlot] });
    const store = memoryStore(paused);
    const result = await tick(org, now, { store, generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: true });
    expect(result.slots.map((item) => item.slotId)).toEqual([slotB]);
    expect(result.slots[0]?.status).toBe("READY");
    expect(paused.control).toEqual({ status: "PAUSED", priorityId: null, revision: 3 });
    const later = planned("d0360000-0000-4000-8000-000000000003", now);
    paused.slots.push(later);
    const blocked = await tick(org, now, { store, generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: true });
    expect(blocked.slots.filter((item) => item.slotId === later.id)).toHaveLength(0);
    expect(paused.control.status).toBe("PAUSED");
  });

  it("AT-036-03: expired promo/stock skip with one replacement; price change makes a new version", async () => {
    const stale = planned(slotA, now, { sourceHealth: "stale_stock" });
    const state = baseState({ slots: [stale] });
    const store = memoryStore(state);
    const skipped = await tick(org, now, { store, generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: true });
    expect(skipped.slots[0]).toMatchObject({ status: "SKIPPED", reason: "stale_stock" });
    expect(skipped.slots[0]?.replacementId).toBeTruthy();
    const again = await tick(org, now, { store, generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: true });
    const replacements = state.slots.filter((slot) => slot.replacedSlotId === slotA);
    expect(replacements).toHaveLength(1);
    expect(again.slots.filter((item) => item.reason === "stale_stock")).toHaveLength(0);

    const priced = planned(slotB, now, { sourceHealth: "price_changed", contentVersionId: "e0360000-0000-4000-8000-000000000001", contentRevision: 1 });
    const pricedState = baseState({ slots: [priced] });
    const versions: number[] = [];
    const pricedResult = await tick(org, now, {
      hasPublishingProvider: true,
      store: memoryStore(pricedState),
      generate: async (input) => {
        versions.push(input.expectedContentRevision);
        return receipt(input, input.expectedContentRevision + 1);
      },
      requestId: randomUUID(),
    });
    expect(versions).toEqual([1]);
    expect(pricedResult.slots[0]).toMatchObject({ status: "READY", reason: "price_changed" });
  });

  it("AT-036-04: crash resume reuses generate request; terminal campaign does not run; timeout does not publish", async () => {
    const live = planned(slotA, now);
    const state = baseState({ slots: [live] });
    const store = memoryStore(state);
    const calls: string[] = [];
    const generate = async (input: GenerateCampaignContentInput) => {
      calls.push(input.requestId);
      if (calls.length === 1) throw Error("PROVIDER_TIMEOUT");
      state.content.set(input.slotId, input.requestId);
      return receipt(input);
    };
    const requestId = randomUUID();
    await expect(tick(org, now, { store, generate, requestId, hasPublishingProvider: true })).rejects.toThrow("PROVIDER_TIMEOUT");
    expect(state.slots[0]?.status).not.toBe("PUBLISHED");
    const resumed = await tick(org, now, { store, generate, requestId, hasPublishingProvider: true });
    expect(calls).toEqual([live.generateRequestId, live.generateRequestId]);
    expect(resumed.slots[0]?.status).toBe("READY");
    expect(resumed.published).toBe(0);

    const dead = planned(slotB, now, { campaignStatus: "FAILED" });
    const terminal = await tick(org, now, { store: memoryStore(baseState({ slots: [dead] })), generate: async (input) => receipt(input), requestId: randomUUID(), hasPublishingProvider: true });
    expect(terminal.slots).toHaveLength(0);
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

describe("scheduler local persistence", () => {
  beforeAllLocal();
  afterAll(() => {
    if (!enabled) return;
    sql(`update public.products set disabled_at=clock_timestamp() where id='${localProduct}'; update public.campaigns set status='FAILED' where id='${localCampaign}'; update public.marketing_control set status='PAUSED',reason='fixture_complete' where organization_id='${localOrg}';`);
  });
  it.skipIf(!enabled)("AT-036-01/02 local claim fence never publishes and respects pause", async () => {
    const client = createClient<Database>("http://127.0.0.1:54321", process.env.ONEVOICE_LOCAL_ADMIN!, { auth: { persistSession: false, autoRefreshToken: false } });
    const store = createSchedulerStore(client);
    const now = new Date().toISOString();
    const first = await store.claim({ organizationId: localOrg, now, requestId: randomUUID() });
    const second = await store.claim({ organizationId: localOrg, now, requestId: randomUUID() });
    const claimed = [...first.slots, ...second.slots].filter((slot) => slot.status === "PLANNED");
    expect(claimed.length).toBeLessThanOrEqual(1);
    if (claimed[0]) {
      const ready = await store.apply({
        organizationId: localOrg, slotId: claimed[0].id, campaignId: claimed[0].campaignId, requestId: claimed[0].decisionRequestId,
        expectedRevision: first.control.revision, action: "ready", reason: "prepared",
      });
      expect(ready.status).toBe("READY");
    }
    expect(sql(`select count(*) from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id where c.organization_id='${localOrg}' and s.status='PUBLISHED';`)).toBe("0");
    sql(`update public.marketing_control set status='PAUSED',priority_campaign_id=null,revision=revision+1,reason='manual_pause' where organization_id='${localOrg}';`);
    const paused = await store.claim({ organizationId: localOrg, now: new Date().toISOString(), requestId: randomUUID() });
    expect(paused.slots.filter((slot) => !slot.priority)).toHaveLength(0);
  }, 20000);
});

function beforeAllLocal() {
  if (!enabled) return;
  if (!sql("select version from supabase_migrations.schema_migrations where version='20260913106000';")) {
    sql(readFileSync("supabase/migrations/20260913106000_marketing_scheduler.sql", "utf8"));
    const columns = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';");
    if (columns.includes("statements") && columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260913106000','marketing_scheduler','{}');");
    else if (columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name) values('20260913106000','marketing_scheduler');");
    else sql("insert into supabase_migrations.schema_migrations(version) values('20260913106000');");
  }
  const settings = JSON.stringify(settingsSchema.parse({ ...defaultSettings().settings, timezone: hcm, timingMode: "constrained", dailyCap: 1, windows: [{ start: "00:00", end: "23:59" }] })).replaceAll("'", "''");
  sql(`begin;
    insert into public.organizations(id,name,slug) values('${localOrg}','Scheduler fixture','${localOrg}');
    insert into auth.users(id) values('${localActor}');
    insert into public.staff_profiles(user_id,organization_id,role) values('${localActor}','${localOrg}','manager');
    insert into public.business_settings(organization_id,revision,settings) values('${localOrg}',1,'${settings}');
    insert into public.marketing_control(organization_id,status,reason) values('${localOrg}','RUNNING','enabled');
    insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality)
      values('${localProduct}','${localOrg}','urn:test:${localProduct}','urn:test:${localProduct}','Keyboard',true,2,100000,'partial');
    insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision)
      values('${localCampaign}','${localOrg}','Scheduler fixture','mixed','product','${localProduct}',false,'{"id":"${localProduct}","skus":[{"id":"${localProduct}","priceVnd":100000,"stockQuantity":2}]}','{}','${hcm}','{}');
    insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('${localSlot}','${localCampaign}',1,clock_timestamp()-interval '1 minute');
  commit;`);
}
