// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { postgresUuid } from "../jobs/types";
import { contentDraftSchema, evidenceSchema, evidenceSelectorSchema, validateContentVersion, type TemplateInventory } from "./passport";
const resultSchema = z.object({ id: postgresUuid, version: z.number().int().positive(), contentHash: z.string() });
function checked<T>(value: { data: T; error: { code?: string } | null }) { if (value.error) throw Error(value.error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(value.error.code ?? "") ? "STALE_CONTENT" : value.error.code === "22023" ? "INVALID_CONTENT" : "CONTENT_UNAVAILABLE"); return value.data; }
/** Trusted OV053/036 service scope, no browser endpoint. Inventory comes from the
 * renderer adapter, never from generation output. SQL is the atomic source/CAS
 * fence; JS validates the complete field passport before invoking it. */
export function createContentVersionRepository(client: SupabaseClient<Database>, organizationId: string, inventory: readonly TemplateInventory[] = []) {
 const org = postgresUuid.parse(organizationId);
 return {
  async evidence(selectors: unknown) {
   const sources = z.array(evidenceSelectorSchema).max(49).parse(selectors);
   if (sources.some(source => source.key === "_settings")) throw Error("RESERVED_EVIDENCE_KEY");
   sources.push({ key: "_settings", kind: "brand", id: org });
   return z.array(evidenceSchema).parse(checked(await client.rpc("read_content_evidence", { p_org: org, p_sources: sources as Json }).abortSignal(AbortSignal.timeout(10000))));
  },
  async save(input: { id: string; slotId: string; requestId: string; expectedVersion: number; draft: unknown; evidence: unknown }) {
   // Preserve generation-time evidence; do not silently replace it with fresh facts.
   const document = validateContentVersion(contentDraftSchema.parse(input.draft), input.evidence, inventory);
   return resultSchema.parse(checked(await client.rpc("save_content_version", { p_org: org, p_slot: postgresUuid.parse(input.slotId), p_id: postgresUuid.parse(input.id), p_request: postgresUuid.parse(input.requestId), p_expected: z.number().int().min(0).max(2147483646).parse(input.expectedVersion), p_document: document as unknown as Json }).abortSignal(AbortSignal.timeout(10000))));
  },
  async current(id: string) {
   return checked(await client.rpc("check_content_version", { p_org: org, p_id: postgresUuid.parse(id) }).abortSignal(AbortSignal.timeout(10000)));
  },
 };
}
