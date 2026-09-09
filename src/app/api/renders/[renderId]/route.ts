// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { VideoManifest } from "@/lib/video/types";

type Context = { params: Promise<{ renderId: string }> };
type Dependencies = Readonly<{
  library: { getRun(renderId: string): Promise<VideoManifest | null> };
}>;

export function createRenderStatusRoute(dependencies: Dependencies) {
  return {
    async GET(_request: Request, context: Context): Promise<Response> {
      const parsed = z.uuid().safeParse((await context.params).renderId);
      if (!parsed.success) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      try {
        const run = await dependencies.library.getRun(parsed.data);
        return run
          ? Response.json(run)
          : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      } catch {
        return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
      }
    },
  };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createRenderStatusRoute(getComposition()).GET(request, context);
}
