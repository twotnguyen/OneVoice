// SPDX-License-Identifier: Apache-2.0
//
// Shared render_events row shape + pure mappers. No `import "server-only"`:
// reducer/store/backfill tests import this module directly (see D5).

import type { GenerateTextResult } from "@/lib/ai/provider";
import type { RenderEventInput } from "@/lib/render/product-video-pipeline";
import type { VideoManifest } from "@/lib/video/types";

/** Insert shape for the `render_events` table (w1 migration owns the DDL). */
export type RenderEventInsert = Readonly<{
  render_id: string;
  organization_id: string;
  product_id: string | null;
  status: "succeeded" | "failed";
  error_stage: string | null;
  error_code: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  stage_timings: Record<string, number> | null;
  total_duration_ms: number | null;
  video_bytes: number | null;
  video_duration_ms: number | null;
  created_at: string;
}>;

/** Live pipeline input → DB row (used by the store). */
export function toRow(input: RenderEventInput, organizationId: string): RenderEventInsert {
  return {
    render_id: input.renderId,
    organization_id: organizationId,
    product_id: input.productId,
    status: input.status,
    error_stage: input.errorStage ?? null,
    error_code: input.errorCode ?? null,
    model: input.model ?? null,
    tokens_input: input.usage?.inputTokens ?? null,
    tokens_output: input.usage?.outputTokens ?? null,
    tokens_total: input.usage?.totalTokens ?? null,
    stage_timings: { ...input.timings },
    total_duration_ms: input.totalDurationMs,
    video_bytes: input.videoBytes ?? null,
    video_duration_ms: input.videoDurationMs ?? null,
    created_at: input.createdAt,
  };
}

export type LegacyRowCtx = Readonly<{
  organizationId: string;
  /** Render-dir mtime as ISO string — documented approximate. */
  createdAt: string;
}>;

/** On-disk manifest → legacy backfill row (rich fields null). */
export function manifestToRenderEvent(
  manifest: VideoManifest,
  ctx: LegacyRowCtx,
): RenderEventInsert {
  const base = {
    render_id: manifest.renderId,
    organization_id: ctx.organizationId,
    product_id: null,
    model: null,
    tokens_input: null,
    tokens_output: null,
    tokens_total: null,
    stage_timings: null,
    total_duration_ms: null,
    created_at: ctx.createdAt,
  } as const;
  if (manifest.status === "succeeded") {
    return {
      ...base,
      status: "succeeded" as const,
      error_stage: null,
      error_code: null,
      video_bytes: manifest.artifact.bytes,
      video_duration_ms: manifest.artifact.durationMs,
    };
  }
  return {
    ...base,
    status: "failed" as const,
    error_stage: manifest.error.stage,
    error_code: manifest.error.code,
    video_bytes: null,
    video_duration_ms: null,
  };
}

export type LiveRowCtx = Readonly<{
  organizationId: string;
  productId: string;
  timings: Readonly<Record<string, number>>;
  usage: GenerateTextResult["usage"];
  model: string | undefined;
  totalDurationMs: number;
  createdAt: string;
}>;

/**
 * Terminal RenderRun → live row. Mirrors the assembly inside
 * `ProductVideoPipeline.terminate()` (which builds its row inline at the
 * seam); kept as the tested pure reference for the mapping.
 */
export function runToRenderEvent(
  run: VideoManifest,
  ctx: LiveRowCtx,
): RenderEventInsert {
  const base = {
    render_id: run.renderId,
    organization_id: ctx.organizationId,
    product_id: ctx.productId,
    model: ctx.model ?? null,
    tokens_input: ctx.usage?.inputTokens ?? null,
    tokens_output: ctx.usage?.outputTokens ?? null,
    tokens_total: ctx.usage?.totalTokens ?? null,
    stage_timings: { ...ctx.timings },
    total_duration_ms: ctx.totalDurationMs,
    created_at: ctx.createdAt,
  } as const;
  if (run.status === "succeeded") {
    return {
      ...base,
      status: "succeeded" as const,
      error_stage: null,
      error_code: null,
      video_bytes: run.artifact.bytes,
      video_duration_ms: run.artifact.durationMs,
    };
  }
  return {
    ...base,
    status: "failed" as const,
    error_stage: run.error.stage,
    error_code: run.error.code,
    video_bytes: null,
    video_duration_ms: null,
  };
}
