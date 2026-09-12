// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { z } from "zod";
import { opportunityInputSchema, type OpportunityDecision } from "../opportunities/engine";
import { postgresUuid } from "../jobs/types";
const candidate = z.strictObject({ key: z.string().min(1).max(160), kind: z.enum(["product", "program", "trend"]), title: z.string().max(500), evidence: z.array(z.string().max(240)).max(101), operational: z.unknown(), expiresAt: z.iso.datetime({ offset: true }).nullable(), components: z.strictObject({ availability: z.number().min(0).max(10), program: z.number().min(0).max(10), objective: z.number().min(0).max(30), ai: z.number().min(0).max(10).nullable(), performance: z.null() }), score: z.number().min(0).max(60) });
const decisionSchema = z.strictObject({ algorithmVersion: z.literal("ov029-v1"), inputDigest: z.string().regex(/^[a-f0-9]{64}$/), snapshot: opportunityInputSchema, decidedAt: z.iso.datetime({ offset: true }), selectedKey: z.string().nullable(), ranked: z.array(candidate).max(50), excluded: z.array(z.strictObject({ key: z.string(), reason: z.string() })).max(1000), ai: z.strictObject({ status: z.enum(["unavailable", "valid", "invalid"]), model: z.string().nullable(), assessments: z.array(z.strictObject({ candidateKey: z.string(), relevance: z.number().min(0).max(1), managerGoalMatch: z.boolean(), explanation: z.string().min(1).max(400) })).max(50) }), performanceStatus: z.literal("unavailable") });
function stable(value: unknown): string { if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]"; if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + stable(item)).join(",") + "}"; return JSON.stringify(value); }
/** Only accept a complete engine result from trusted server composition, never browser JSON. */
export function validateCampaignDecision(value: OpportunityDecision): OpportunityDecision {
 const result = decisionSchema.parse(structuredClone(value)); const snapshot = result.snapshot;
 for (const item of result.ranked) {
  if (!item.key.startsWith(item.kind + ":")) throw Error("INVALID_DECISION");
  if (item.kind === "product") z.strictObject({ skus: z.array(z.strictObject({ id: postgresUuid, priceVnd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), stockQuantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })).min(1).max(100), programs: opportunityInputSchema.shape.programs }).parse(item.operational);
  else if (item.kind === "program") opportunityInputSchema.shape.programs.element.parse(item.operational);
  else if (item.operational !== null) throw Error("INVALID_DECISION");
 }
 if (result.algorithmVersion !== "ov029-v1" || createHash("sha256").update(stable(snapshot)).digest("hex") !== result.inputDigest) throw Error("INVALID_DECISION");
 if (!result.selectedKey || !result.ranked.some(item => item.key === result.selectedKey)) throw Error("NO_SELECTION");
 if (!Number.isFinite(Date.parse(result.decidedAt)) || JSON.stringify(result).length > 1000000) throw Error("INVALID_DECISION");
 return result as OpportunityDecision;
}
