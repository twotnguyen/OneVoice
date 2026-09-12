// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { withApiPermission, renderRequestLimiter } from "@/lib/auth/guards";
import type { StaffSession } from "@/lib/auth/session";
import { createCampaignGenerationStore } from "@/lib/content/campaign-generation";
import { contentDraftSchema, templateInventorySchema } from "@/lib/content/passport";
import { campaignSlotSchema } from "@/lib/campaigns/management";
import {
  handleStudioGet,
  handleStudioPost,
  type StudioDeps,
  type StudioDocument,
} from "@/lib/content/studio-service";
import { createContentVersionRepository } from "@/lib/content/version-repository";
import { createRenderStore } from "@/lib/jobs/render-adapter";
import { postgresUuid } from "@/lib/jobs/types";
import { readServerEnv } from "@/lib/env/server";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const rowSchema = z.object({
  id: postgresUuid,
  version: z.number().int().positive(),
  request_id: postgresUuid,
  content_hash: z.string(),
  slot_id: postgresUuid,
  document: z.object({
    draft: contentDraftSchema,
    evidence: z.unknown(),
    templates: z.array(templateInventorySchema).optional(),
  }).passthrough(),
});

function asDocument(row: z.infer<typeof rowSchema>): StudioDocument {
  return {
    id: row.id,
    version: row.version,
    requestId: row.request_id,
    contentHash: row.content_hash,
    slotId: row.slot_id,
    draft: row.document.draft,
    evidence: row.document.evidence,
    templates: row.document.templates ?? [],
  };
}

export function createStudioDeps(actor: StaffSession): StudioDeps {
  const client = createSupabaseDataClient();
  const generation = createCampaignGenerationStore(client, actor.organizationId);
  const renders = createRenderStore(client);
  const { ai } = readServerEnv();
  async function loadVersion(id: string): Promise<StudioDocument | null> {
    const value = await client
      .from("content_versions")
      .select("id,version,request_id,content_hash,slot_id,document")
      .eq("id", postgresUuid.parse(id))
      .eq("organization_id", actor.organizationId)
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
    if (value.error) throw Error("CONTENT_UNAVAILABLE");
    if (!value.data) return null;
    return asDocument(rowSchema.parse(value.data));
  }
  return {
    provider: new OpenAICompatibleProvider({ baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model }),
    generation,
    loadVersion,
    async loadSlotDocument(slotId) {
      await generation.loadSlot(slotId);
      const value = await client
        .from("campaign_slots")
        .select("content_version_id")
        .eq("id", postgresUuid.parse(slotId))
        .abortSignal(AbortSignal.timeout(10000))
        .maybeSingle();
      if (value.error) throw Error("CONTENT_UNAVAILABLE");
      const contentVersionId = value.data?.content_version_id;
      if (typeof contentVersionId !== "string" || !contentVersionId) return null;
      return loadVersion(contentVersionId);
    },
    async saveVersion(input) {
      return createContentVersionRepository(client, actor.organizationId, input.inventory).save(input);
    },
    enqueueRender: (contentVersionId) => renders.enqueue(actor.organizationId, contentVersionId),
    receipt: (renderId) => renders.receipt(actor.organizationId, renderId),
    latestReceipt: (slotId) => renders.latest(actor.organizationId, slotId),
    async loadHistory(slotId) {
      const value = await client.rpc("read_slot_content_history", {
        p_org: actor.organizationId,
        p_actor: actor.userId,
        p_slot: postgresUuid.parse(slotId),
      }).abortSignal(AbortSignal.timeout(10000));
      if (value.error) throw Error("CONTENT_UNAVAILABLE");
      return (campaignSlotSchema.parse(value.data).versions ?? []).map((entry) => ({
        id: entry.id,
        version: entry.version,
        contentHash: entry.contentHash,
        caption: entry.caption ?? null,
        hook: entry.hook ?? null,
        cta: entry.cta ?? null,
        script: entry.script,
        validation: entry.validation,
        passportFields: entry.passportFields,
        artifactHash: entry.artifactHash ?? null,
      }));
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  return withApiPermission(request, "read_operations", async (actor) => handleStudioGet(request, actor, createStudioDeps(actor)));
}

export async function POST(request: Request): Promise<Response> {
  return withApiPermission(request, "manage_marketing", async (actor) => handleStudioPost(request, actor, createStudioDeps(actor)), {
    mutation: true,
    limiter: renderRequestLimiter,
  });
}
