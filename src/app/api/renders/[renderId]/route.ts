// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { RenderJob } from "@/lib/queue/types";
import { defaultDiagnosticSink, type DiagnosticSink } from "@/lib/render/diagnostics";
import type { RenderProgressStore } from "@/lib/render/progress-store";
import { toRenderRunView } from "@/lib/render/types";
import type { VideoManifest } from "@/lib/video/types";

type Context = { params: Promise<{ renderId: string }> };
type Dependencies = Readonly<{
  library: { getRun(renderId: string): Promise<VideoManifest | null> };
  queue?: { get(renderId: string): Promise<RenderJob | null> };
  progress?: RenderProgressStore;
  diagnostic?: DiagnosticSink;
}>;

export function createRenderStatusRoute(dependencies: Dependencies) {
  return {
    async GET(_request: Request, context: Context): Promise<Response> {
      const parsed = z.uuid().safeParse((await context.params).renderId);
      if (!parsed.success) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      const renderId = parsed.data;

      // 1. Terminal, authoritative: library.getRun()
      try {
        const run = await dependencies.library.getRun(renderId);
        if (run) return Response.json(toRenderRunView(run));
      } catch {
        (dependencies.diagnostic ?? defaultDiagnosticSink)({ stage: "media", code: "STORAGE_UNAVAILABLE" });
        return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
      }

      // 2. In flight: queue.get()
      if (dependencies.queue) {
        try {
          const job = await dependencies.queue.get(renderId);
          if (job && (job.status === "queued" || job.status === "running")) {
            return Response.json({
              renderId: job.renderId,
              status: job.status,
              ...(job.stage ? { stage: job.stage } : {}),
            });
          }
        } catch {
          // Queue read failure falls through
        }
      }

      // 3. Fallback for progress store
      const running = dependencies.progress?.get(renderId);
      if (running) return Response.json(running);

      return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    },
  };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createRenderStatusRoute(getComposition()).GET(request, context);
}
