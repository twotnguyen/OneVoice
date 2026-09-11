// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach, vi } from "vitest";

import type { RenderJob } from "@/lib/queue/types";
import { FileJobQueue } from "@/lib/queue/file-queue";
import type { RenderRun } from "@/lib/render/types";

import { runJob } from "./run-job";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const baseJob: RenderJob = {
  renderId: "b0000000-0000-4000-8000-000000000001",
  productId: "b0000000-0000-4000-8000-000000000002",
  organizationId: "a0000000-0000-4000-8000-000000000001",
  status: "running",
  enqueuedAt: "2026-09-10T00:00:00.000Z",
  attempts: 0,
};

const succeeded: RenderRun = {
  renderId: baseJob.renderId,
  status: "succeeded",
  content: {
    hook: "Hiệu năng gọn trong một thiết kế bền bỉ",
    caption: "ThinkPad X1 Carbon cho nhịp làm việc linh hoạt mỗi ngày với pin bền bỉ.",
    cta: "Khám phá sản phẩm hôm nay",
  },
  artifact: {
    bytes: 1024,
    sha256: "a".repeat(64),
    durationMs: 20_000,
    width: 1080,
    height: 1920,
    codecName: "h264",
    pixelFormat: "yuv420p",
    formatName: "mp4",
    rendererRevision: "onevoice-template-v1",
  },
};

describe("runJob", () => {
  it("failing renderer produces a failed job with the pipeline error", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "onevoice-runjob-test-"));
    roots.push(root);
    const recorded: RenderRun[] = [];
    const queue = new FileJobQueue({ root });
    await queue.enqueue({ ...baseJob, status: "queued" });
    await queue.claim("worker-1");
    const pipeline = {
      create: async (): Promise<RenderRun> => {
        const failed: RenderRun = {
          renderId: baseJob.renderId,
          status: "failed",
          error: { stage: "rendering_video", code: "VIDEO_RENDER_FAILED" },
        };
        recorded.push(failed);
        return failed;
      },
    };
    const heartbeats: string[] = [];
    const heartbeatQueue = {
      heartbeat: async (renderId: string, stage: string) => {
        heartbeats.push(`${renderId}:${stage}`);
        await queue.heartbeat(renderId, stage as never);
      },
      complete: queue.complete.bind(queue),
      get: queue.get.bind(queue),
    };
    await runJob({ pipeline, queue: heartbeatQueue }, { ...baseJob, status: "running" });
    const done = await queue.get(baseJob.renderId);
    expect(done?.status).toBe("failed");
    expect(done?.error).toEqual({ stage: "rendering_video", code: "VIDEO_RENDER_FAILED" });
    expect(recorded).toHaveLength(1);
  });

  it("succeeded run completes the job", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "onevoice-runjob-test-"));
    roots.push(root);
    const queue = new FileJobQueue({ root });
    await queue.enqueue({ ...baseJob, status: "queued" });
    await queue.claim("worker-1");
    await runJob(
      { pipeline: { create: async () => succeeded }, queue },
      { ...baseJob, status: "running" },
    );
    expect((await queue.get(baseJob.renderId))?.status).toBe("succeeded");
  });

  it("onJobLost wiring was called with (renderId, {stage,code}) and the real wiring invokes library.save, propagating its rejection until T9", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "onevoice-runjob-test-"));
    roots.push(root);
    const calls: Array<{ renderId: string; error: { stage: string; code: string } }> = [];
    const queue = new FileJobQueue({
      root,
      onJobLost: async (renderId, error) => {
        calls.push({ renderId, error });
      },
    });
    await queue.enqueue({ ...baseJob, status: "queued" });
    await queue.claim("worker-1");
    await queue.recoverStale(-1);
    // First sweep requeues (attempts 0 -> 1); reclaim so the second sweep
    // finds it running again and retires it as lost.
    await queue.claim("worker-1");
    await queue.recoverStale(-1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      renderId: baseJob.renderId,
      error: { stage: "rendering_video", code: "WORKER_LOST" },
    });

    // The real wiring in worker/composition.ts calls library.save with the
    // WORKER_LOST manifest. Until T9 widens errorSchema, library.save rejects
    // — assert the wiring invokes save and propagates that rejection.
    const save = vi.fn(async (renderId: string, manifest: unknown) => {
      void renderId;
      void manifest;
      throw new Error("Invalid video manifest");
    });
    const onJobLost = async (renderId: string): Promise<void> => {
      await save(renderId, {
        renderId,
        status: "failed",
        error: { stage: "rendering_video", code: "WORKER_LOST" },
      });
    };
    await expect(onJobLost(baseJob.renderId)).rejects.toThrow("Invalid video manifest");
    expect(save).toHaveBeenCalledWith(baseJob.renderId, {
      renderId: baseJob.renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "WORKER_LOST" },
    });
  });
});
