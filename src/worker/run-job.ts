// SPDX-License-Identifier: Apache-2.0
// Pure-ish job body: claim -> ProductVideoPipeline.create -> record -> release.
// Reuses ProductVideoPipeline (do not reimplement); onStage is rewired from
// progress.update to queue.heartbeat. The job file holds the validated
// ProductScript only (bounded by T2 schema) — never raw model output (R-M).

import type { OrganizationScope } from "@/lib/catalog/types";
import type { JobQueue, RenderJob } from "@/lib/queue/types";
import type { ProductVideoPipeline } from "@/lib/render/product-video-pipeline";

export type RunJobDeps = Readonly<{
  pipeline: Pick<ProductVideoPipeline, "create">;
  queue: Pick<JobQueue, "heartbeat" | "complete" | "get">;
}>;

export async function runJob(deps: RunJobDeps, job: RenderJob): Promise<void> {
  const scope: OrganizationScope = { organizationId: job.organizationId };
  const run = await deps.pipeline.create({
    renderId: job.renderId,
    productId: job.productId,
    scope,
    onStage: (stage) => {
      void deps.queue.heartbeat(job.renderId, stage).catch(() => {});
    },
  });
  if (run.status === "succeeded") {
    await deps.queue.complete(job.renderId, { status: "succeeded" });
    return;
  }
  await deps.queue.complete(job.renderId, {
    status: "failed",
    error: { stage: run.error.stage, code: run.error.code },
  });
}
