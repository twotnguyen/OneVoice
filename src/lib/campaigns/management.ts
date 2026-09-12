// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid } from "../jobs/types";
export const manualCampaignSchema = z.strictObject({ id: postgresUuid, requestId: postgresUuid, expectedControlRevision: z.number().int().min(0).max(2147483646), sourceKind: z.enum(["product", "program"]), sourceId: postgresUuid, objective: z.enum(["engagement", "messages", "paid-orders", "mixed"]) });
export type ManualCampaign = z.infer<typeof manualCampaignSchema>;
export const unscheduleSlotSchema = z.strictObject({ slotId: postgresUuid, requestId: postgresUuid });
export type UnscheduleSlot = z.infer<typeof unscheduleSlotSchema>;
export const campaignQuerySchema = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1) });
export const campaignVersionSchema = z.object({ id: postgresUuid, version: z.number(), contentHash: z.string(), caption: z.string().nullable().optional(), hook: z.string().nullable().optional(), cta: z.string().nullable().optional(), script: z.unknown().nullable().optional(), validation: z.unknown().nullable().optional(), passportFields: z.unknown().nullable().optional(), artifactHash: z.string().nullable().optional() });
export const campaignSlotSchema = z.object({ id: postgresUuid, ordinal: z.number(), status: z.string(), scheduledAt: z.string().nullable(), contentVersionId: postgresUuid.nullable(), contentRevision: z.number().optional(), decisionReason: z.string().nullable().optional(), caption: z.string().nullable().optional(), hook: z.string().nullable().optional(), cta: z.string().nullable().optional(), script: z.unknown().nullable().optional(), validation: z.unknown().nullable().optional(), passportFields: z.unknown().nullable().optional(), artifactHash: z.string().nullable().optional(), versions: z.array(campaignVersionSchema).optional() });
export const campaignSchema = z.object({ id: postgresUuid, title: z.string(), objective: z.string(), sourceKind: z.string(), sourceRef: z.string(), priority: z.boolean(), status: z.string(), version: z.number(), timezone: z.string(), createdAt: z.string(), decision: z.unknown().nullable(), sourceSnapshot: z.unknown(), slots: z.array(campaignSlotSchema) });
export type Campaign = z.infer<typeof campaignSchema>;
export const campaignPageSchema = z.object({ page: z.number(), total: z.number(), items: z.array(campaignSchema), control: z.object({ status: z.enum(["RUNNING", "PAUSED"]), revision: z.number(), priorityId: postgresUuid.nullable(), reason: z.string() }) });
export type CampaignPage = z.infer<typeof campaignPageSchema>;
