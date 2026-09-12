// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { GeneratedVideoScript } from "../content/generate-video-script";
import type { GeneratedProductContent } from "../content/types";
import type { LocalVideoLibrary } from "../video/local-video-library";
import type { RenderRun } from "../render/types";
import { postgresUuid, type BusinessJob, type BusinessJobQueue } from "./types";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const receiptStatus = z.enum(["succeeded", "failed", "not_publishable"]);
const receiptSchema = z.object({
  renderId: postgresUuid,
  contentVersionId: postgresUuid,
  slotId: postgresUuid,
  contentRevision: z.number().int().positive(),
  contentHash: hash,
  templateHash: hash,
  mediaHash: hash,
  artifactHash: hash.nullable(),
  manifestPath: z.string().nullable(),
  status: receiptStatus,
  publishable: z.boolean(),
});
const workSchema = z.object({
  renderId: postgresUuid,
  organizationId: postgresUuid,
  contentVersionId: postgresUuid,
  slotId: postgresUuid,
  contentRevision: z.number().int().positive(),
  contentHash: hash,
  templateHash: hash,
  mediaHash: hash,
  productId: postgresUuid,
  script: z.unknown().nullable(),
  content: z.object({ hook: z.string(), caption: z.string(), cta: z.string(), model: z.string() }),
});
const claimed = z.object({
  id: postgresUuid,
  organization_id: postgresUuid,
  entity_id: postgresUuid,
  kind: z.literal("render_content"),
  lease_owner: postgresUuid,
  lease_token: postgresUuid,
});

export type RenderReceipt = z.infer<typeof receiptSchema>;
export type RenderWork = z.infer<typeof workSchema>;
export type RenderOutcome =
  | { status: "succeeded"; artifactHash: string; manifestPath: string }
  | { status: "failed" | "not_publishable"; artifactHash?: null; manifestPath?: null };

export type InspectedArtifact =
  | { kind: "missing" }
  | { kind: "partial" }
  | { kind: "corrupt" }
  | { kind: "mismatch" }
  | { kind: "failed" }
  | { kind: "ready"; artifactHash: string; manifestPath: string };

export type ArtifactLibrary = Pick<LocalVideoLibrary, "getRun" | "videoExists" | "readVideo">;
export type ContentRenderPipeline = {
  create(command: {
    renderId: string;
    productId: string;
    scope: { organizationId: string };
    persisted: { script: GeneratedVideoScript["script"]; content: GeneratedProductContent };
  }): Promise<RenderRun>;
};

function checked<T>(value: { data: T; error: { code?: string; message?: string } | null }): T {
  if (value.error) throw Error(value.error.code === "42501" ? "FORBIDDEN" : value.error.code === "22023" ? "INVALID_RENDER" : `RENDER_UNAVAILABLE:${value.error.code ?? ""}`);
  return value.data;
}

async function call(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  return checked(await (client.rpc as (fn: string, args: Record<string, unknown>) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string } | null }> })(name, args).abortSignal(AbortSignal.timeout(10000)));
}

export async function inspectRenderArtifact(library: ArtifactLibrary, renderId: string): Promise<InspectedArtifact> {
  let manifest;
  try { manifest = await library.getRun(renderId); }
  catch { return { kind: "corrupt" }; }
  if (!manifest) return (await library.videoExists(renderId)) ? { kind: "partial" } : { kind: "missing" };
  if (manifest.status !== "succeeded") return { kind: "failed" };
  if (!(await library.videoExists(renderId))) return { kind: "mismatch" };
  const video = await library.readVideo(renderId);
  if (!video) return { kind: "mismatch" };
  try {
    if (video.size !== manifest.artifact.bytes) return { kind: "mismatch" };
    const digest = createHash("sha256");
    for await (const chunk of video.stream(0, video.size - 1)) digest.update(chunk);
    if (digest.digest("hex") !== manifest.artifact.sha256) return { kind: "mismatch" };
    return { kind: "ready", artifactHash: manifest.artifact.sha256, manifestPath: `${renderId}/manifest.json` };
  } finally { await video.close(); }
}

export interface RenderAdapterStore {
  enqueue(organizationId: string, contentVersionId: string): Promise<string>;
  load(job: BusinessJob): Promise<RenderWork | null>;
  receipt(organizationId: string, renderId: string): Promise<RenderReceipt | null>;
  latest(organizationId: string, slotId: string): Promise<RenderReceipt | null>;
  finish(job: BusinessJob, outcome: RenderOutcome): Promise<RenderReceipt | null>;
  stale(organizationId: string, limit?: number): Promise<string[]>;
  queue: Pick<BusinessJobQueue, "claim" | "heartbeat" | "finish">;
}

export function createRenderStore(client: SupabaseClient<Database>): RenderAdapterStore {
  return {
    async enqueue(organizationId, contentVersionId) {
      const row = z.object({ renderId: postgresUuid, contentVersionId: postgresUuid }).parse(await call(client, "enqueue_render", { p_org: postgresUuid.parse(organizationId), p_content_version_id: postgresUuid.parse(contentVersionId) }));
      return row.renderId;
    },
    async load(job) {
      const data = await call(client, "load_render_job", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token });
      return data == null ? null : workSchema.parse(data);
    },
    async receipt(organizationId, renderId) {
      const data = await call(client, "read_render_receipt", { p_org: postgresUuid.parse(organizationId), p_render_id: postgresUuid.parse(renderId) });
      return data == null ? null : receiptSchema.parse(data);
    },
    async latest(organizationId, slotId) {
      const data = await call(client, "latest_publishable_render", { p_org: postgresUuid.parse(organizationId), p_slot: postgresUuid.parse(slotId) });
      return data == null ? null : receiptSchema.parse(data);
    },
    async finish(job, outcome) {
      const data = await call(client, "finish_render", {
        p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token,
        p_outcome: outcome.status === "succeeded" ? { status: "succeeded", artifactHash: hash.parse(outcome.artifactHash), manifestPath: outcome.manifestPath } : { status: outcome.status },
      });
      return data == null ? null : receiptSchema.parse(data);
    },
    async stale(organizationId, limit = 20) {
      return z.array(postgresUuid).parse(await call(client, "list_stale_renders", { p_org: postgresUuid.parse(organizationId), p_limit: z.number().int().min(1).max(100).parse(limit) }));
    },
    queue: {
      async claim(owner) {
        const rows = z.array(claimed).max(1).parse(await call(client, "claim_render_job", { p_owner: postgresUuid.parse(owner) }));
        return rows[0] ?? null;
      },
      async heartbeat(job) {
        return z.boolean().parse(await call(client, "heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_lease_seconds: 60 }));
      },
      async finish(job, error) {
        return z.boolean().parse(await call(client, "finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error ?? null }));
      },
    },
  };
}

export async function processRenderJob(deps: { store: RenderAdapterStore; library: ArtifactLibrary; pipeline: ContentRenderPipeline }, job: BusinessJob): Promise<RenderReceipt | null> {
  const work = await deps.store.load(job);
  if (!work) throw Error("RENDER_LEASE_LOST");
  const prior = await deps.store.receipt(work.organizationId, work.renderId);
  if (prior) return prior;
  const inspected = await inspectRenderArtifact(deps.library, work.renderId);
  if (inspected.kind === "ready") return attached(deps.store, job, { status: "succeeded", artifactHash: inspected.artifactHash, manifestPath: inspected.manifestPath });
  if (inspected.kind === "mismatch" || inspected.kind === "corrupt" || inspected.kind === "partial") return attached(deps.store, job, { status: "not_publishable" });
  if (inspected.kind === "failed") return attached(deps.store, job, { status: "failed" });
  if (work.script == null) return attached(deps.store, job, { status: "failed" });
  const run = await deps.pipeline.create({
    renderId: work.renderId,
    productId: work.productId,
    scope: { organizationId: work.organizationId },
    persisted: { script: work.script as GeneratedVideoScript["script"], content: work.content },
  });
  if (run.status === "succeeded") {
    const written = await inspectRenderArtifact(deps.library, work.renderId);
    if (written.kind === "ready") return attached(deps.store, job, { status: "succeeded", artifactHash: written.artifactHash, manifestPath: written.manifestPath });
    return attached(deps.store, job, { status: "not_publishable" });
  }
  return attached(deps.store, job, { status: "failed" });
}
async function attached(store: RenderAdapterStore, job: BusinessJob, outcome: RenderOutcome) {
  const receipt = await store.finish(job, outcome);
  if (!receipt) throw Error("RENDER_LEASE_LOST");
  return receipt;
}

export function createRenderHandler(deps: { store: RenderAdapterStore; library: ArtifactLibrary; pipeline: ContentRenderPipeline }) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    if (signal.aborted) throw Error("shutdown");
    await processRenderJob(deps, job);
  };
}
