// SPDX-License-Identifier: Apache-2.0
// File-backed render job queue: shared progress record between the Next app
// (enqueue-only) and the separate worker process (claim -> render -> release).
// Both mount the same onevoice-renders volume; the job file is the transport.

import { z } from "zod";

import type { RenderStage } from "@/lib/render/types";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export const RenderJobSchema = z
  .object({
    renderId: z.uuid(),
    productId: z.uuid(),
    organizationId: z.uuid(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    stage: z
      .enum([
        "loading_product",
        "generating_content",
        "resolving_asset",
        "synthesizing_voice",
        "composing_scenes",
        "rendering_video",
        "storing_artifact",
      ])
      .optional(),
    enqueuedAt: z.iso.datetime(),
    startedAt: z.iso.datetime().optional(),
    finishedAt: z.iso.datetime().optional(),
    attempts: z.number().int().nonnegative(),
    workerId: z.string().min(1).max(128).optional(),
    heartbeatAt: z.iso.datetime().optional(),
    error: z
      .object({
        stage: z.string().min(1).max(64),
        code: z.string().min(1).max(64),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RenderJob = z.infer<typeof RenderJobSchema>;

export type JobOutcome =
  | Readonly<{ status: "succeeded" }>
  | Readonly<{ status: "failed"; error: { stage: string; code: string } }>;

export type JobQueue = Readonly<{
  enqueue(job: RenderJob): Promise<void>;
  claim(workerId: string): Promise<RenderJob | null>;
  heartbeat(renderId: string, stage: RenderStage): Promise<void>;
  complete(renderId: string, outcome: JobOutcome): Promise<void>;
  get(renderId: string): Promise<RenderJob | null>;
  recoverStale(maxAgeMs: number): Promise<number>;
}>;

export type FileJobQueueOptions = Readonly<{
  root: string;
  onJobLost?: (renderId: string, error: { stage: string; code: string }) => Promise<void>;
}>;
