// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { postgresUuid, type BusinessJob, type BusinessJobQueue } from "../jobs/types";
import { canPublishMarketingJob, type AutomationState } from "./automation-control";
import type { CampaignContentReceipt, GenerateCampaignContentInput } from "../content/campaign-generation";

export const AUTO_DAILY_CAP = 1;
export const AUTO_WINDOWS = Object.freeze([{ start: "10:00", end: "16:00" }]);
export const MAX_REPLACEMENTS = 1;
export const CLAIM_LEASE_MS = 120_000;

export type SourceHealth = "ok" | "price_changed" | "stale_stock" | "expired_promo";
export type SlotDecision = { slotId: string; status: string; reason: string; contentVersionId?: string | null; replacementId?: string | null };
export type ClaimedSlot = {
  id: string;
  campaignId: string;
  priority: boolean;
  campaignStatus: string;
  status: string;
  scheduledAt: string | null;
  contentVersionId: string | null;
  contentRevision: number;
  replacedSlotId: string | null;
  generateRequestId: string;
  decisionRequestId: string;
  sourceHealth: SourceHealth;
};
export type ClaimResult = {
  control: AutomationState & { revision: number };
  timezone: string;
  slots: ClaimedSlot[];
};
export type SchedulerStore = {
  claim(input: { organizationId: string; now: string; requestId: string; expectedRevision?: number }): Promise<ClaimResult>;
  apply(input: {
    organizationId: string;
    slotId: string;
    campaignId: string;
    requestId: string;
    expectedRevision: number;
    action: "ready" | "skipped" | "waiting_channel";
    reason: string;
    contentVersionId?: string | null;
    replace?: boolean;
  }): Promise<SlotDecision>;
  completePriority(input: { organizationId: string; campaignId: string; requestId: string; expectedRevision: number }): Promise<{ status: "PAUSED"; priorityId: null; revision: number }>;
  priorityPending(organizationId: string, campaignId: string): Promise<number>;
  queue?: Pick<BusinessJobQueue, "claim" | "heartbeat" | "finish"> & { enqueueDue(): Promise<number> };
};
export type SchedulerDeps = {
  store: SchedulerStore;
  generate: (input: GenerateCampaignContentInput) => Promise<CampaignContentReceipt>;
  enqueueRender?: (contentVersionId: string) => Promise<string>;
  latestRender?: (slotId: string) => Promise<{ publishable: boolean } | null>;
  format?: "post" | "video";
  requestId?: string;
  expectedRevision?: number;
  signal?: AbortSignal;
  hasPublishingProvider?: boolean | (() => boolean | Promise<boolean>);
};
export type SchedulerTickResult = { requestId: string; slots: SlotDecision[]; published: 0 };

export function hasFacebookPublishingProvider(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.FACEBOOK_PAGE_ACCESS_TOKEN?.trim());
}

export function waitingChannelRequestId(slotId: string): string {
  const h = createHash("md5").update(`${postgresUuid.parse(slotId)}:waiting_channel`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function publishingProviderConfigured(deps: SchedulerDeps): Promise<boolean> {
  const configured = deps.hasPublishingProvider;
  if (typeof configured === "boolean") return configured;
  if (typeof configured === "function") return Boolean(await configured());
  return hasFacebookPublishingProvider();
}

export function localParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) if (part.type !== "literal") bag[part.type] = part.value;
  return { year: Number(bag.year), month: Number(bag.month), day: Number(bag.day), hour: Number(bag.hour), minute: Number(bag.minute) };
}
export function localDayKey(now: Date, timeZone: string) {
  const part = localParts(now, timeZone);
  return `${part.year}-${String(part.month).padStart(2, "0")}-${String(part.day).padStart(2, "0")}`;
}
export function fromZoned(timeZone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(target);
  for (let i = 0; i < 4; i++) {
    const part = localParts(instant, timeZone);
    instant = new Date(instant.getTime() + (target - Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, 0)));
  }
  return instant;
}
export function timingPolicy(settings: { timingMode: string; dailyCap: number; windows: { start: string; end: string }[] }) {
  if (settings.timingMode === "constrained") return { dailyCap: settings.dailyCap, windows: settings.windows };
  return { dailyCap: AUTO_DAILY_CAP, windows: AUTO_WINDOWS.map((window) => ({ ...window })) };
}
function addUtcDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
export function nextSlotInstants(input: { timeZone: string; now: Date; dailyCap: number; windows: { start: string; end: string }[]; reserved: Date[]; count: number }) {
  const reserved = new Map<string, number>();
  for (const instant of input.reserved) {
    const key = localDayKey(instant, input.timeZone);
    reserved.set(key, (reserved.get(key) ?? 0) + 1);
  }
  const now = localParts(input.now, input.timeZone);
  const windows = [...input.windows].sort((a, b) => a.start.localeCompare(b.start));
  const out: Date[] = [];
  for (let offset = 0; offset < 14 && out.length < input.count; offset++) {
    const day = addUtcDays(now.year, now.month, now.day, offset);
    const key = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
    let used = reserved.get(key) ?? 0;
    for (const window of windows) {
      if (out.length >= input.count || used >= input.dailyCap) break;
      const [startHour, startMinute] = window.start.split(":").map(Number);
      const [endHour, endMinute] = window.end.split(":").map(Number);
      const start = fromZoned(input.timeZone, day.year, day.month, day.day, startHour, startMinute);
      const end = fromZoned(input.timeZone, day.year, day.month, day.day, endHour, endMinute);
      if (end.getTime() <= input.now.getTime()) continue;
      const instant = start.getTime() > input.now.getTime() ? start : new Date(Math.ceil(input.now.getTime() / 60000) * 60000);
      if (instant.getTime() >= end.getTime()) continue;
      out.push(instant);
      used += 1;
      reserved.set(key, used);
    }
  }
  return out;
}
function prices(value: unknown) {
  if (!value || typeof value !== "object" || !("skus" in value) || !Array.isArray(value.skus)) return "";
  return JSON.stringify(value.skus.map((sku) => sku && typeof sku === "object" && "priceVnd" in sku ? sku.priceVnd ?? null : null));
}
export function classifySource(kind: string, snapshot: unknown, current: unknown): SourceHealth {
  if (current && typeof current === "object" && "error" in current) return kind === "product" ? "stale_stock" : "expired_promo";
  if (kind === "product" && prices(snapshot) !== prices(current)) return "price_changed";
  return "ok";
}

export async function tick(organizationId: string, now: Date, deps: SchedulerDeps): Promise<SchedulerTickResult> {
  const requestId = postgresUuid.parse(deps.requestId ?? randomUUID());
  const org = postgresUuid.parse(organizationId);
  if (deps.signal?.aborted) throw Error("CANCELLED");
  const claimed = await deps.store.claim({ organizationId: org, now: now.toISOString(), requestId, expectedRevision: deps.expectedRevision });
  const slots: SlotDecision[] = [];
  const format = deps.format ?? "post";
  for (const slot of claimed.slots) {
    if (deps.signal?.aborted) throw Error("CANCELLED");
    if (!["PLANNED", "ACTIVE"].includes(slot.campaignStatus)) continue;
    const job = slot.priority ? { kind: "priority" as const, priorityId: slot.campaignId } : { kind: "ordinary" as const };
    if (!canPublishMarketingJob({ status: claimed.control.status, priorityId: claimed.control.priorityId }, job)) continue;
    if (slot.status === "READY") {
      const canPublish = await publishingProviderConfigured(deps);
      if (canPublish || !slot.contentVersionId) {
        slots.push({ slotId: slot.id, status: "READY", reason: "already_ready", contentVersionId: slot.contentVersionId });
        continue;
      }
      if (format === "video") {
        const render = deps.latestRender ? await deps.latestRender(slot.id) : null;
        if (!render?.publishable) {
          slots.push({ slotId: slot.id, status: "READY", reason: "already_ready", contentVersionId: slot.contentVersionId });
          continue;
        }
      }
      slots.push(await deps.store.apply({
        organizationId: org, slotId: slot.id, campaignId: slot.campaignId, requestId: waitingChannelRequestId(slot.id),
        expectedRevision: claimed.control.revision, action: "waiting_channel",
        reason: "missing_publishing_provider", contentVersionId: slot.contentVersionId,
      }));
      continue;
    }
    if (slot.status !== "PLANNED") continue;
    if (slot.sourceHealth === "stale_stock" || slot.sourceHealth === "expired_promo") {
      slots.push(await deps.store.apply({
        organizationId: org, slotId: slot.id, campaignId: slot.campaignId, requestId: slot.decisionRequestId,
        expectedRevision: claimed.control.revision, action: "skipped", reason: slot.sourceHealth,
        replace: !slot.replacedSlotId,
      }));
      continue;
    }
    let contentVersionId = slot.contentVersionId;
    let contentRevision = slot.contentRevision;
    if (!contentVersionId || slot.sourceHealth === "price_changed") {
      try {
        const generated = await deps.generate({
          organizationId: org, slotId: slot.id, expectedContentRevision: contentRevision, requestId: slot.generateRequestId, format,
        });
        contentVersionId = generated.id;
        contentRevision = generated.version;
        if (format === "video" && deps.enqueueRender) await deps.enqueueRender(generated.id);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "PROVIDER_TIMEOUT" || code === "CANCELLED") throw error;
        if (/STALE|UNAVAILABLE|TRUTH|SOURCE|FORBIDDEN|CONTENT_/.test(code)) {
          slots.push(await deps.store.apply({
            organizationId: org, slotId: slot.id, campaignId: slot.campaignId, requestId: slot.decisionRequestId,
            expectedRevision: claimed.control.revision, action: "skipped", reason: "stale_source", replace: !slot.replacedSlotId,
          }));
          continue;
        }
        throw error;
      }
    }
    if (format === "video") {
      const render = deps.latestRender ? await deps.latestRender(slot.id) : null;
      if (!render) {
        slots.push({ slotId: slot.id, status: "PLANNED", reason: "render_pending", contentVersionId });
        continue;
      }
      if (!render.publishable) {
        slots.push(await deps.store.apply({
          organizationId: org, slotId: slot.id, campaignId: slot.campaignId, requestId: slot.decisionRequestId,
          expectedRevision: claimed.control.revision, action: "skipped", reason: "render_failed", replace: false,
        }));
        continue;
      }
    }
    const canPublish = await publishingProviderConfigured(deps);
    slots.push(await deps.store.apply({
      organizationId: org, slotId: slot.id, campaignId: slot.campaignId, requestId: slot.decisionRequestId,
      expectedRevision: claimed.control.revision,
      action: canPublish ? "ready" : "waiting_channel",
      reason: slot.sourceHealth === "price_changed" ? "price_changed" : canPublish ? "prepared" : "missing_publishing_provider",
      contentVersionId,
    }));
  }
  if (claimed.control.priorityId) {
    const pending = await deps.store.priorityPending(org, claimed.control.priorityId);
    if (pending === 0) await deps.store.completePriority({ organizationId: org, campaignId: claimed.control.priorityId, requestId, expectedRevision: claimed.control.revision });
  }
  return { requestId, slots, published: 0 };
}

const claimSchema = z.object({
  control: z.discriminatedUnion("status", [
    z.object({ status: z.literal("RUNNING"), priorityId: z.null(), revision: z.number().int().min(0) }),
    z.object({ status: z.literal("PAUSED"), priorityId: postgresUuid.nullable(), revision: z.number().int().min(0) }),
  ]),
  timezone: z.string(),
  slots: z.array(z.object({
    id: postgresUuid, campaignId: postgresUuid, priority: z.boolean(), campaignStatus: z.string(), status: z.string(),
    scheduledAt: z.string().nullable(), contentVersionId: postgresUuid.nullable(), contentRevision: z.number().int().min(0),
    replacedSlotId: postgresUuid.nullable(), generateRequestId: postgresUuid, decisionRequestId: postgresUuid,
    sourceHealth: z.enum(["ok", "price_changed", "stale_stock", "expired_promo"]),
  })),
});
const decisionSchema = z.object({ slotId: postgresUuid, status: z.string(), reason: z.string(), contentVersionId: postgresUuid.nullable().optional(), replacementId: postgresUuid.nullable().optional() });
const claimedJob = z.object({ id: postgresUuid, organization_id: postgresUuid, entity_id: postgresUuid, kind: z.literal("automation_tick"), lease_owner: postgresUuid, lease_token: postgresUuid });

function checked<T>(value: { data: T; error: { code?: string; message?: string } | null }): T {
  if (value.error) throw Error(value.error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(value.error.code ?? "") ? "CONFLICT" : ["22023", "22P02", "23514"].includes(value.error.code ?? "") ? "INVALID" : "UNAVAILABLE");
  return value.data;
}
async function call(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  return checked(await (client.rpc as (fn: string, args: Record<string, unknown>) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> })(name, args).abortSignal(AbortSignal.timeout(10000)));
}

export function createSchedulerStore(client: SupabaseClient<Database>): SchedulerStore {
  return {
    async claim(input) {
      const data = await call(client, "claim_marketing_tick", {
        p_org: postgresUuid.parse(input.organizationId), p_request: postgresUuid.parse(input.requestId),
        p_now: z.iso.datetime({ offset: true }).parse(input.now), p_revision: input.expectedRevision ?? null,
      });
      return claimSchema.parse(data);
    },
    async apply(input) {
      return decisionSchema.parse(await call(client, "apply_slot_decision", {
        p_org: postgresUuid.parse(input.organizationId), p_slot: postgresUuid.parse(input.slotId),
        p_campaign: postgresUuid.parse(input.campaignId), p_request: postgresUuid.parse(input.requestId),
        p_revision: z.number().int().min(0).parse(input.expectedRevision),
        p_document: { action: input.action, reason: input.reason, contentVersionId: input.contentVersionId ?? null, replace: Boolean(input.replace) },
      }));
    },
    async completePriority(input) {
      return z.object({ status: z.literal("PAUSED"), priorityId: z.null(), revision: z.number().int().min(0) }).parse(await call(client, "complete_priority_control", {
        p_org: postgresUuid.parse(input.organizationId), p_campaign: postgresUuid.parse(input.campaignId),
        p_request: postgresUuid.parse(input.requestId), p_revision: z.number().int().min(0).parse(input.expectedRevision),
      }));
    },
    async priorityPending(organizationId, campaignId) {
      return z.number().int().min(0).parse(await call(client, "priority_pending_slots", { p_org: postgresUuid.parse(organizationId), p_campaign: postgresUuid.parse(campaignId) }));
    },
    queue: {
      async enqueueDue() { return z.number().parse(await call(client, "enqueue_due_automation_ticks", {})); },
      async claim(owner) {
        const rows = z.array(claimedJob).max(1).parse(await call(client, "claim_automation_tick", { p_owner: postgresUuid.parse(owner) }));
        return rows[0] ?? null;
      },
      async heartbeat(job) { return z.boolean().parse(await call(client, "heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_lease_seconds: 60 })); },
      async finish(job, error) { return z.boolean().parse(await call(client, "finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error ?? null })); },
    },
  };
}

export function createAutomationTickHandler(deps: { store: SchedulerStore; generate: SchedulerDeps["generate"]; enqueueRender?: SchedulerDeps["enqueueRender"]; latestRender?: SchedulerDeps["latestRender"]; format?: "post" | "video" }) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    await tick(job.organization_id, new Date(), { store: deps.store, generate: deps.generate, enqueueRender: deps.enqueueRender, latestRender: deps.latestRender, format: deps.format, requestId: job.id, signal });
  };
}
