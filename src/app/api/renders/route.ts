// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { OrganizationScope } from "@/lib/catalog/types";
import type { RenderJob } from "@/lib/queue/types";
import { RenderGate, sharedRenderGate } from "@/lib/render/render-gate";
import type { VideoManifest } from "@/lib/video/types";

type Dependencies = Readonly<{
  scope: OrganizationScope;
  queue: { enqueue(job: RenderJob): Promise<void> };
  library?: { getRun(renderId: string): Promise<VideoManifest | null> };
  gate?: RenderGate;
}>;

const commandSchema = z.object({ renderId: z.uuid(), productId: z.uuid() });

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

        const job: RenderJob = {
          renderId,
          productId: parsed.data.productId,
          organizationId: dependencies.scope.organizationId,
          status: "queued",
          enqueuedAt: new Date().toISOString(),
          attempts: 0,
        };

        try {
          await dependencies.queue.enqueue(job);
        } catch (error) {
          if (error instanceof Error && error.message === "JOB_EXISTS") {
            return Response.json({ error: { code: "RENDER_ID_IN_USE" } }, { status: 409 });
          }
          return Response.json({ error: { code: "RENDER_FAILED" } }, { status: 500 });
        }

        const base = `/api/renders/${renderId}`;
        return Response.json({
          renderId,
          status: "queued",
          urls: { status: base, video: `${base}/video`, download: `${base}/download` },
        }, { status: 202 });
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
