// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { OrganizationScope } from "@/lib/catalog/types";
import type { RenderRun } from "@/lib/render/types";
import type { RenderProgressStore } from "@/lib/render/progress-store";
import type { RenderStage } from "@/lib/render/types";

type Dependencies = Readonly<{
  scope: OrganizationScope;
  pipeline: {
    create(command: { renderId: string; productId: string; scope: OrganizationScope; onStage?: (stage: RenderStage) => void }): Promise<RenderRun>;
  };
  progress?: RenderProgressStore;
}>;

const commandSchema = z.object({ renderId: z.uuid(), productId: z.uuid() });
const statusByCode = {
  PRODUCT_NOT_FOUND: 404,
  AI_GENERATION_FAILED: 502,
  IMAGE_RESOLUTION_FAILED: 500,
  CATALOG_FAILED: 500,
  VIDEO_RENDER_FAILED: 500,
  STORAGE_FAILED: 500,
} as const;

export function createRendersRoute(dependencies: Dependencies) {
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
      try {
        dependencies.progress?.start(parsed.data.renderId);
        const run = await dependencies.pipeline.create({
          ...parsed.data,
          scope: dependencies.scope,
          onStage: (stage) => dependencies.progress?.update(parsed.data.renderId, stage),
        });
        if (run.status === "failed") {
          return Response.json(
            { error: run.error },
            { status: statusByCode[run.error.code] },
          );
        }
        const base = `/api/renders/${run.renderId}`;
        return Response.json({
          ...run,
          urls: { status: base, video: `${base}/video`, download: `${base}/download` },
        }, { status: 201 });
      } catch {
        return Response.json({ error: { code: "RENDER_FAILED" } }, { status: 500 });
      } finally {
        dependencies.progress?.clear(parsed.data.renderId);
      }
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createRendersRoute(getComposition()).POST(request);
}
