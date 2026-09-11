// SPDX-License-Identifier: Apache-2.0
// Pure-ish job body: claim -> ProductVideoPipeline.create -> record -> release.
// Reuses ProductVideoPipeline (do not reimplement); onStage is rewired from
// progress.update to queue.heartbeat. The job file holds the validated
// ProductScript only (bounded by T2 schema) — never raw model output (R-M).

import type { OrganizationScope } from "@/lib/catalog/types";
import type { JobQueue, RenderJob } from "@/lib/queue/types";
import type { ProductVideoPipeline } from "@/lib/render/product-video-pipeline";
import type { RenderRun } from "@/lib/render/types";

export type RunJobDeps = Readonly<{
  pipeline: Pick<ProductVideoPipeline, "create">;
  queue: Pick<JobQueue, "heartbeat" | "complete" | "get">;
}>;

export async function runJob(deps: RunJobDeps, job: RenderJob): Promise<void> {
  const scope: OrganizationScope = { organizationId: job.organizationId };
  // First heartbeat rejection, if any. Recorded instead of swallowed: the
  // onStage seam is synchronous, so it surfaces after the terminal state is
  // durable (thrown at the end) rather than vanishing into a void catch.
  let heartbeatError: unknown;
  let heartbeatFailed = false;
  let run: RenderRun;
  try {
    run = await deps.pipeline.create({
      renderId: job.renderId,
      productId: job.productId,
      scope,
      onStage: (stage) => {
        void deps.queue.heartbeat(job.renderId, stage).catch((error: unknown) => {
          if (!heartbeatFailed) {
            heartbeatFailed = true;
            heartbeatError = error;
          }
        });
      },
    });
  } catch {
    // Fail-fast: pipeline.create threw without recording a terminal state
    // (it never throws by contract — this is a crash/bug path). Persist the
    // failed outcome immediately so the job never stalls in running/ waiting
    // for a recoverStale sweep. Only queue.complete itself still throws.
    await deps.queue.complete(job.renderId, {
      status: "failed",
      error: { stage: "rendering_video", code: "VIDEO_RENDER_FAILED" },
    });
    if (heartbeatFailed) throw heartbeatError;
    return;
  }
  if (run.status === "succeeded") {
    await deps.queue.complete(job.renderId, { status: "succeeded" });
  } else {
    await deps.queue.complete(job.renderId, {
      status: "failed",
      error: { stage: run.error.stage, code: run.error.code },
    });
  }
  // A heartbeat failure must not fail the job, but must not vanish either:
  // the terminal state above is durable, so surface the first failure now.
  if (heartbeatFailed) throw heartbeatError;
}
