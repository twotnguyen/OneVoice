// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AiProvider } from "../ai/provider";
import { canPerformBusinessAction } from "../business/permissions";
import type { RenderReceipt } from "../jobs/render-adapter";
import { postgresUuid } from "../jobs/types";
import {
  generateCampaignContent,
  type CampaignContentReceipt,
  type CampaignGenerationStore,
} from "./campaign-generation";
import {
  contentDraftSchema,
  validateContentVersion,
  type TemplateInventory,
} from "./passport";

export const STUDIO_VOICE_IDS = ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural", "vieneu"] as const;
export const studioVoiceIdSchema = z.enum(STUDIO_VOICE_IDS);
export type StudioVoiceId = z.infer<typeof studioVoiceIdSchema>;

export type StudioActor = Readonly<{ role: string; organizationId: string; userId: string }>;
export type StudioPost = Readonly<{ hook: string; caption: string; cta: string }>;
export type StudioArtifactUrls = Readonly<{ status: string; video: string; download: string }>;

export type StudioDocument = Readonly<{
  id: string;
  version: number;
  requestId: string;
  contentHash: string;
  slotId: string;
  draft: z.infer<typeof contentDraftSchema>;
  evidence: unknown;
  templates: readonly TemplateInventory[];
}>;

export type StudioReceipt = Readonly<{
  id: string;
  version: number;
  contentHash: string;
  requestId: string;
  artifactHash: null;
  replayed: boolean;
  attempts?: CampaignContentReceipt["attempts"];
  model?: string | null;
  slotId: string;
  voiceId: StudioVoiceId | null;
  renderId: string | null;
  artifactRenderId: string | null;
  post: StudioPost;
  urls: StudioArtifactUrls | null;
}>;

export type StudioHistoryEntry = Readonly<{
  id: string;
  version: number;
  contentHash: string;
  caption: string | null;
  hook: string | null;
  cta: string | null;
  script: unknown;
  validation: unknown;
  passportFields: unknown;
  artifactHash: string | null;
}>;

export type StudioSession = Readonly<{
  slotId: string;
  sourceKind: string;
  contentRevision: number;
  contentVersionId: string | null;
  voiceId: StudioVoiceId | null;
  post: StudioPost | null;
  renderId: string | null;
  artifactRenderId: string | null;
  urls: StudioArtifactUrls | null;
  slotStatus: string;
  history: readonly StudioHistoryEntry[];
}>;

export type StudioDeps = {
  provider: AiProvider;
  generation: CampaignGenerationStore;
  loadVersion(id: string): Promise<StudioDocument | null>;
  loadSlotDocument(slotId: string): Promise<StudioDocument | null>;
  saveVersion(input: {
    id: string;
    slotId: string;
    requestId: string;
    expectedVersion: number;
    draft: unknown;
    evidence: unknown;
    inventory: readonly TemplateInventory[];
  }): Promise<{ id: string; version: number; contentHash: string }>;
  enqueueRender(contentVersionId: string): Promise<string>;
  receipt(renderId: string): Promise<RenderReceipt | null>;
  latestReceipt(slotId: string): Promise<RenderReceipt | null>;
  loadHistory?(slotId: string): Promise<readonly StudioHistoryEntry[]>;
  signal?: AbortSignal;
};

const generateInputSchema = z.strictObject({
  slotId: postgresUuid,
  requestId: postgresUuid,
  expectedContentRevision: z.number().int().min(0).max(2147483646),
  format: z.enum(["post", "video"]),
  voiceId: studioVoiceIdSchema.optional(),
});

const editInputSchema = z.strictObject({
  slotId: postgresUuid,
  requestId: postgresUuid,
  expectedContentRevision: z.number().int().min(0).max(2147483646),
  voiceId: studioVoiceIdSchema.optional(),
  draft: contentDraftSchema.optional(),
  post: z.strictObject({ hook: z.string().max(10000), caption: z.string().max(10000), cta: z.string().max(10000) }).optional(),
  contentId: postgresUuid.optional(),
});

const renderInputSchema = z.strictObject({
  slotId: postgresUuid,
  requestId: postgresUuid.optional(),
  expectedContentRevision: z.number().int().min(0).max(2147483646).optional(),
  voiceId: studioVoiceIdSchema.optional(),
});

const postBodySchema = z.strictObject({
  action: z.enum(["generate", "edit", "regenerate", "render"]),
  slotId: postgresUuid,
  requestId: postgresUuid,
  expectedContentRevision: z.number().int().min(0).max(2147483646),
  format: z.enum(["post", "video"]).optional(),
  voiceId: studioVoiceIdSchema.optional(),
  draft: contentDraftSchema.optional(),
  post: z.strictObject({ hook: z.string().max(10000), caption: z.string().max(10000), cta: z.string().max(10000) }).optional(),
});

export function studioArtifactUrls(renderId: string): StudioArtifactUrls {
  const base = `/api/renders/${postgresUuid.parse(renderId)}`;
  return { status: base, video: `${base}/video`, download: `${base}/download` };
}

export function requireStudioManager(actor: StudioActor): void {
  if (!canPerformBusinessAction(actor.role, "manage_marketing")) throw Error("FORBIDDEN");
}

export function applyStudioVoice(draft: unknown, voiceId: StudioVoiceId | undefined) {
  const parsed = contentDraftSchema.parse(draft);
  if (!voiceId || !parsed.script) return parsed;
  return { ...parsed, script: { ...parsed.script, voice: { ...parsed.script.voice, voiceId } } };
}

function voiceFromDraft(draft: z.infer<typeof contentDraftSchema> | null | undefined): StudioVoiceId | null {
  const value = draft?.script?.voice.voiceId;
  const parsed = studioVoiceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function withVoiceStore(store: CampaignGenerationStore, voiceId: StudioVoiceId | undefined): CampaignGenerationStore {
  if (!voiceId) return store;
  return {
    ...store,
    async save(input) {
      return store.save({ ...input, draft: applyStudioVoice(input.draft, voiceId) });
    },
  };
}

function validationFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : "VALIDATION";
  if (/^(FORBIDDEN|STALE_CONTENT|CANCELLED|NOT_FOUND|CONTENT_UNAVAILABLE)$/.test(message.split(":")[0] ?? "")) {
    throw error instanceof Error ? error : Error(message);
  }
  throw Error(`VALIDATION: ${message}`);
}
type StudioRenderBinding = {
  renderId: string | null;
  artifactRenderId: string | null;
  urls: StudioArtifactUrls | null;
};

function attachArtifact(receipt: RenderReceipt | null, contentVersionId: string | null, queuedRenderId: string | null = null): StudioRenderBinding {
  if (receipt && contentVersionId !== null && receipt.contentVersionId === contentVersionId) {
    if (receipt.status === "succeeded" && receipt.artifactHash) {
      return { renderId: receipt.renderId, artifactRenderId: receipt.renderId, urls: studioArtifactUrls(receipt.renderId) };
    }
    return { renderId: receipt.renderId, artifactRenderId: null, urls: null };
  }
  if (queuedRenderId) return { renderId: queuedRenderId, artifactRenderId: null, urls: null };
  return { renderId: null, artifactRenderId: null, urls: null };
}

async function receiptForVersion(deps: StudioDeps, document: StudioDocument): Promise<RenderReceipt | null> {
  const latest = await deps.latestReceipt(document.slotId);
  if (latest && latest.contentVersionId === document.id) return latest;
  try {
    const mapped = await deps.receipt(document.id);
    if (mapped && mapped.contentVersionId === document.id) return mapped;
  } catch {
    return latest;
  }
  return latest;
}

function toReceipt(
  generated: CampaignContentReceipt,
  slotId: string,
  document: StudioDocument | null,
  voiceId: StudioVoiceId | null,
  render: StudioRenderBinding,
): StudioReceipt {
  const post = document?.draft.post ?? { hook: "", caption: "", cta: "" };
  return {
    id: generated.id,
    version: generated.version,
    contentHash: generated.contentHash,
    requestId: generated.requestId,
    artifactHash: null,
    replayed: generated.replayed,
    attempts: generated.attempts,
    model: generated.model,
    slotId,
    voiceId: voiceId ?? voiceFromDraft(document?.draft),
    renderId: render.renderId,
    artifactRenderId: render.artifactRenderId,
    post,
    urls: render.urls,
  };
}

export async function generateStudioContent(
  actor: StudioActor,
  input: z.input<typeof generateInputSchema>,
  deps: StudioDeps,
): Promise<StudioReceipt> {
  requireStudioManager(actor);
  const value = generateInputSchema.parse(input);
  const generated = await generateCampaignContent(
    {
      organizationId: actor.organizationId,
      slotId: value.slotId,
      expectedContentRevision: value.expectedContentRevision,
      requestId: value.requestId,
      format: value.format,
    },
    { provider: deps.provider, store: withVoiceStore(deps.generation, value.voiceId), signal: deps.signal },
  );
  const document = await deps.loadVersion(generated.id);
  const queuedRenderId = value.format === "video" ? await deps.enqueueRender(generated.id) : null;
  const mapped = queuedRenderId ? await deps.receipt(queuedRenderId) : document ? await receiptForVersion(deps, document) : null;
  return toReceipt(generated, value.slotId, document, value.voiceId ?? null, attachArtifact(mapped, generated.id, queuedRenderId));

}

export async function editStudioContent(
  actor: StudioActor,
  input: z.input<typeof editInputSchema>,
  deps: StudioDeps,
): Promise<StudioReceipt> {
  requireStudioManager(actor);
  const value = editInputSchema.parse(input);
  if (!value.draft && !value.post) throw Error("INVALID");
  const current = await deps.loadSlotDocument(value.slotId);
  if (!current) throw Error("CONTENT_UNAVAILABLE");
  if (current.version !== value.expectedContentRevision) throw Error("STALE_CONTENT");
  const base = value.draft ?? current.draft;
  const post = value.post ?? base.post;
  const patched = applyStudioVoice(
    {
      ...base,
      post,
      script: base.script ? { ...base.script, meta: post } : null,
    },
    value.voiceId,
  );
  const inventory: readonly TemplateInventory[] = current.templates;
  try {
    validateContentVersion(patched, current.evidence, inventory);
  } catch (error) {
    validationFailure(error);
  }
  const saved = await deps.saveVersion({
    id: value.contentId ?? randomUUID(),
    slotId: value.slotId,
    requestId: value.requestId,
    expectedVersion: value.expectedContentRevision,
    draft: patched,
    evidence: current.evidence,
    inventory,
  });
  const document = (await deps.loadVersion(saved.id)) ?? {
    ...current,
    id: saved.id,
    version: saved.version,
    requestId: value.requestId,
    contentHash: saved.contentHash,
    draft: patched,
    templates: inventory,
  };
  const queuedRenderId = patched.script ? await deps.enqueueRender(saved.id) : null;
  const mapped = queuedRenderId ? await deps.receipt(queuedRenderId) : null;
  return toReceipt(
    { id: saved.id, version: saved.version, contentHash: saved.contentHash, requestId: value.requestId, artifactHash: null, attempts: 1, replayed: false, model: patched.model.id },
    value.slotId,
    document,
    value.voiceId ?? voiceFromDraft(patched),
    attachArtifact(mapped, saved.id, queuedRenderId),
  );
}

export async function enqueueStudioRender(
  actor: StudioActor,
  input: z.input<typeof renderInputSchema>,
  deps: StudioDeps,
): Promise<StudioReceipt> {
  requireStudioManager(actor);
  const value = renderInputSchema.parse(input);
  const document = await deps.loadSlotDocument(value.slotId);
  if (!document) throw Error("CONTENT_UNAVAILABLE");
  if (value.expectedContentRevision !== undefined && document.version !== value.expectedContentRevision) throw Error("STALE_CONTENT");
  const draft = applyStudioVoice(document.draft, value.voiceId);
  if (value.voiceId && document.draft.script && document.draft.script.voice.voiceId !== value.voiceId) {
    try {
      validateContentVersion(draft, document.evidence, document.templates);
    } catch (error) {
      validationFailure(error);
    }
  }
  const queuedRenderId = await deps.enqueueRender(document.id);
  const mapped = await deps.receipt(queuedRenderId);
  return toReceipt(
    { id: document.id, version: document.version, contentHash: document.contentHash, requestId: document.requestId, artifactHash: null, attempts: 1, replayed: true, model: document.draft.model.id },
    value.slotId,
    { ...document, draft },
    value.voiceId ?? voiceFromDraft(draft),
    attachArtifact(mapped, document.id, queuedRenderId),
  );
}

export async function loadStudioSession(
  actor: StudioActor,
  query: { slotId?: string; renderId?: string },
  deps: StudioDeps,
): Promise<StudioSession> {
  void actor;
  const slotIdValue = query.slotId ? postgresUuid.parse(query.slotId) : undefined;
  const renderIdValue = query.renderId ? postgresUuid.parse(query.renderId) : undefined;
  if (!slotIdValue && !renderIdValue) throw Error("INVALID");
  let receipt: RenderReceipt | null = null;
  if (renderIdValue) receipt = await deps.receipt(renderIdValue);
  const slotId = slotIdValue ?? receipt?.slotId;
  if (!slotId) throw Error("NOT_FOUND");
  if (receipt && slotIdValue && receipt.slotId !== slotIdValue) receipt = null;
  const slot = await deps.generation.loadSlot(slotId);
  const document = await deps.loadSlotDocument(slotId);
  const currentReceipt = document ? await receiptForVersion(deps, document) : null;
  const artifact = attachArtifact(currentReceipt, document?.id ?? null);
  const history = deps.loadHistory ? await deps.loadHistory(slotId) : [];
  if (receipt && document && receipt.contentVersionId !== document.id) {
    return {
      slotId,
      sourceKind: slot.sourceKind,
      contentRevision: slot.contentRevision,
      contentVersionId: document.id,
      voiceId: voiceFromDraft(document.draft),
      post: document.draft.post,
      renderId: artifact.renderId,
      artifactRenderId: artifact.artifactRenderId,
      urls: artifact.urls,
      slotStatus: slot.slotStatus,
      history,
    };
  }
  const attached = attachArtifact(currentReceipt ?? receipt, document?.id ?? null);
  return {
    slotId,
    sourceKind: slot.sourceKind,
    contentRevision: slot.contentRevision,
    contentVersionId: document?.id ?? null,
    voiceId: voiceFromDraft(document?.draft),
    post: document?.draft.post ?? null,
    renderId: attached.renderId,
    artifactRenderId: attached.artifactRenderId,
    urls: attached.urls,
    slotStatus: slot.slotStatus,
    history,
  };
}

function publicError(error: unknown): { status: number; code: string } {
  const raw = error instanceof Error ? error.message : "STUDIO_UNAVAILABLE";
  const code = raw.split(":")[0]?.trim() ?? "STUDIO_UNAVAILABLE";
  if (code === "FORBIDDEN") return { status: 403, code: "FORBIDDEN" };
  if (code === "NOT_FOUND") return { status: 404, code: "NOT_FOUND" };
  if (code === "STALE_CONTENT") return { status: 409, code: "STALE_CONTENT" };
  if (code === "INVALID") return { status: 400, code: "INVALID" };
  if (code === "VALIDATION" || code === "TRUTH_GUARD" || code === "CLAIM_MISMATCH" || code === "UNCOVERED_TEXT" || code === "INVALID_CONTENT" || code === "POST_SCRIPT_MISMATCH") {
    return { status: 400, code: "VALIDATION" };
  }
  if (code === "CONTENT_UNAVAILABLE") return { status: 409, code: "CONTENT_UNAVAILABLE" };
  return { status: 500, code: "STUDIO_UNAVAILABLE" };
}

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw Error("INVALID");
  const reader = request.body?.getReader();
  if (!reader) throw Error("INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 200_000) {
        await reader.cancel();
        throw Error("INVALID");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("INVALID");
  }
}

export async function handleStudioGet(request: Request, actor: StudioActor, deps: StudioDeps): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const session = await loadStudioSession(actor, {
      slotId: params.get("slotId") ?? undefined,
      renderId: params.get("renderId") ?? undefined,
    }, deps);
    return Response.json(session);
  } catch (error) {
    const mapped = publicError(error);
    return Response.json({ error: { code: mapped.code } }, { status: mapped.status });
  }
}

export async function handleStudioPost(request: Request, actor: StudioActor, deps: StudioDeps): Promise<Response> {
  try {
    requireStudioManager(actor);
    const body = postBodySchema.parse(await readJson(request));
    if (body.action === "edit") {
      return Response.json(await editStudioContent(actor, {
        slotId: body.slotId,
        requestId: body.requestId,
        expectedContentRevision: body.expectedContentRevision,
        voiceId: body.voiceId,
        draft: body.draft,
        post: body.post,
      }, deps));
    }
    if (body.action === "render") {
      return Response.json(await enqueueStudioRender(actor, {
        slotId: body.slotId,
        requestId: body.requestId,
        expectedContentRevision: body.expectedContentRevision,
        voiceId: body.voiceId,
      }, deps));
    }
    if (!body.format) throw Error("INVALID");
    return Response.json(await generateStudioContent(actor, {
      slotId: body.slotId,
      requestId: body.requestId,
      expectedContentRevision: body.expectedContentRevision,
      format: body.format,
      voiceId: body.voiceId,
    }, deps), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: "INVALID" } }, { status: 400 });
    }
    const mapped = publicError(error);
    return Response.json({ error: { code: mapped.code } }, { status: mapped.status });
  }
}

