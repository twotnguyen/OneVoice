// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { VideoManifest } from "@/lib/video/types";
import { defaultDiagnosticSink, type DiagnosticSink } from "@/lib/render/diagnostics";
import { toRenderRunView } from "@/lib/render/types";
import type { RenderProgressStore } from "@/lib/render/progress-store";

type Context = { params: Promise<{ renderId: string }> };
type Dependencies = Readonly<{
  library: { getRun(renderId: string): Promise<VideoManifest | null> };
  progress?: RenderProgressStore;
  diagnostic?: DiagnosticSink;
}>;

export function createRenderStatusRoute(dependencies: Dependencies) {
  return {
    async GET(_request: Request, context: Context): Promise<Response> {
      const parsed = z.uuid().safeParse((await context.params).renderId);
      if (!parsed.success) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      const running = dependencies.progress?.get(parsed.data);
      if (running) return Response.json(running);
      try {
        const run = await dependencies.library.getRun(parsed.data);
        return run
          ? Response.json(toRenderRunView(run))
          : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      } catch {
        (dependencies.diagnostic ?? defaultDiagnosticSink)({ stage: "media", code: "STORAGE_UNAVAILABLE" });
        return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
      }
    },
  };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createRenderStatusRoute(getComposition()).GET(request, context);
}
