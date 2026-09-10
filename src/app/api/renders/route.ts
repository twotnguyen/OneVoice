// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { OrganizationScope } from "@/lib/catalog/types";
import type { RenderProgressStore } from "@/lib/render/progress-store";
import { RenderGate, sharedRenderGate } from "@/lib/render/render-gate";
import type { RenderRun, RenderStage } from "@/lib/render/types";
import { toRenderRunView } from "@/lib/render/types";
import type { VideoManifest, VideoManifestError } from "@/lib/video/types";

type Dependencies = Readonly<{
  scope: OrganizationScope;
  pipeline: {
    create(command: { renderId: string; productId: string; scope: OrganizationScope; onStage?: (stage: RenderStage) => void }): Promise<RenderRun>;
  };
  progress?: RenderProgressStore;
  library?: { getRun(renderId: string): Promise<VideoManifest | null> };
  gate?: RenderGate;
}>;

const commandSchema = z.object({ renderId: z.uuid(), productId: z.uuid() });
const statusByCode: Record<VideoManifestError["code"], number> = {
  PRODUCT_NOT_FOUND: 404,
  AI_GENERATION_FAILED: 502,
  SCRIPT_SCHEMA_INVALID: 502,
  SCRIPT_TRUTH_VIOLATION: 502,
  SCRIPT_DURATION_EXCEEDED: 502,
  IMAGE_RESOLUTION_FAILED: 500,
  CATALOG_FAILED: 500,
  TTS_UNAVAILABLE: 503,
  TTS_TIMEOUT: 503,
  NARRATION_OVERRUNS_SCENE: 500,
  VIDEO_RENDER_FAILED: 500,
  STORAGE_FAILED: 500,
};

export function createRendersRoute(dependencies: Dependencies) {
  const gate = dependencies.gate ?? sharedRenderGate;
  return {
    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
      }
      const parsed = commandSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
      }
      const { renderId } = parsed.data;

      // Synchronous dedupe: a concurrent POST for the same id loses here before it can
      // start the pipeline or touch this operation's progress entry.
      if (!gate.claim(renderId)) {
        return Response.json({ error: { code: "RENDER_ID_IN_USE" } }, { status: 409 });
      }
      try {
        // Replay guard: a POST reusing a persisted id must not re-run the pipeline
        // (Supabase read, real AI call, image fetch, ffmpeg) only to fail at save.
        if (dependencies.library) {
          let existing: VideoManifest | null = null;
          try {
            existing = await dependencies.library.getRun(renderId);
          } catch {
            existing = null;
          }
          if (existing) {
            return Response.json({ error: { code: "RENDER_ID_IN_USE" } }, { status: 409 });
          }
        }

        const releaseSlot = await gate.acquireSlot();
        try {
          dependencies.progress?.start(renderId);
          const run = await dependencies.pipeline.create({
            ...parsed.data,
            scope: dependencies.scope,
            onStage: (stage) => dependencies.progress?.update(renderId, stage),
          });
          if (run.status === "failed") {
            return Response.json(
              { error: run.error },
              { status: statusByCode[run.error.code] },
            );
          }
          const view = toRenderRunView(run);
          const base = `/api/renders/${view.renderId}`;
          return Response.json({
            ...view,
            urls: { status: base, video: `${base}/video`, download: `${base}/download` },
          }, { status: 201 });
        } catch {
          return Response.json({ error: { code: "RENDER_FAILED" } }, { status: 500 });
        } finally {
          releaseSlot();
          dependencies.progress?.clear(renderId);
        }
      } finally {
        gate.release(renderId);
      }
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createRendersRoute(getComposition()).POST(request);
}
