// SPDX-License-Identifier: Apache-2.0
//
// End-to-end worker integration test suite (T12).
// Gated behind ONEVOICE_E2E === "1".
// Tests worker job claim -> pipeline render -> library save -> queue completion
// and error / stale-worker recovery handling.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CatalogRepository } from "@/lib/catalog/repository";
import type { ProductSnapshot } from "@/lib/catalog/types";
import { FileJobQueue } from "@/lib/queue/file-queue";
import type { RenderJob } from "@/lib/queue/types";
import { ProductVideoPipeline } from "@/lib/render/product-video-pipeline";
import type { RenderStage } from "@/lib/render/types";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";
import type { RenderedVideo, VideoStoryboard } from "@/lib/video/types";

import { runJob } from "./run-job";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe.skipIf(!process.env.ONEVOICE_E2E)("worker e2e", () => {
  const orgId = "a0000000-0000-4000-8000-000000000001";
  const productId = "b0000000-0000-4000-8000-000000000002";
  const renderId = "c0000000-0000-4000-8000-000000000003";

  const sampleSnapshot: ProductSnapshot = {
    productId,
    organizationId: orgId,
    name: "Dell XPS 13 9315",
    sku: "DELL-XPS-9315",
    brand: "Dell",
    priceVnd: 28_990_000,
    currency: "VND",
    stockQuantity: 5,
    collectedAt: "2026-09-10T10:00:00.000Z",
    primaryImageUrl: null,
    facts: [
      { ref: "cpu", label: "Vi xử lý", value: "Intel Core i5-1230U", critical: true },
      { ref: "ram", label: "RAM", value: "16GB LPDDR5", critical: true },
      { ref: "display", label: "Màn hình", value: "13.4 inch FHD+ Anti-Glare", critical: false },
    ],
  };

  const sampleStoryboard: VideoStoryboard = {
    schema: "onevoice.storyboard.v1",
    template: "product-spotlight-v1",
    canvas: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 12000,
    },
    scenes: [
      { kind: "hook", durationMs: 4000, lines: ["Dell XPS 13", "Hiệu năng mỏng nhẹ"] },
      { kind: "facts", durationMs: 4000, lines: ["Intel i5 Gen 12", "16GB RAM mượt mà"] },
      { kind: "cta", durationMs: 4000, lines: ["Sở hữu ngay hôm nay", "Chính hãng OneVoice"] },
    ],
  };

  it("executes complete worker claim -> render -> save -> complete lifecycle", async () => {
    const queueRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-queue-"));
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-media-"));
    tempRoots.push(queueRoot, mediaRoot);

    const heartbeats: Array<{ renderId: string; stage: RenderStage }> = [];

    const queue = new FileJobQueue({
      root: queueRoot,
      onJobLost: async (lostRenderId) => {
        await library.save(lostRenderId, {
          renderId: lostRenderId,
          status: "failed",
          error: { stage: "rendering_video", code: "WORKER_LOST" },
        });
      },
    });

    const library = new LocalVideoLibrary(mediaRoot);

    const catalog: Pick<CatalogRepository, "getProductSnapshot"> = {
      async getProductSnapshot(_scope, pId) {
        if (pId === productId) return sampleSnapshot;
        return null;
      },
    };

    const recordedEvents: unknown[] = [];
    const recordEvent = {
      async record(input: unknown): Promise<void> {
        recordedEvents.push(input);
      },
    };

    // Construct pipeline with fast deterministic video renderer mock creating valid MP4 stub
    const pipeline = new ProductVideoPipeline({
      catalog,
      generateContent: async () => ({
        hook: "Dell XPS 13 mỏng nhẹ thanh lịch",
        caption: "Hiệu năng bứt phá cùng Intel Gen 12 và màn hình InfinityEdge rực rỡ.",
        cta: "Đặt mua ngay hôm nay",
        model: "gpt-4o-mini",
      }),
      imageResolver: {
        resolve: async () => null,
      },
      compileStoryboard: () => sampleStoryboard,
      renderer: {
        render: async (): Promise<RenderedVideo> => {
          const videoFile = path.join(mediaRoot, "test-output.mp4");
          // Write minimal valid-sized mock file
          await writeFile(videoFile, Buffer.alloc(1024 * 1024, 0));
          return {
            path: videoFile,
            bytes: 1024 * 1024,
            sha256: "b".repeat(64),
            durationMs: 12000,
            width: 1080,
            height: 1920,
            codecName: "h264",
            pixelFormat: "yuv420p",
            formatName: "mp4",
            rendererRevision: "onevoice-template-v1",
            cleanup: async () => {},
          };
        },
      },
      library,
      recordEvent,
    });

    // 1. Enqueue job
    const job: RenderJob = {
      renderId,
      productId,
      organizationId: orgId,
      status: "queued",
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    await queue.enqueue(job);

    // Verify job is queued
    const queuedJob = await queue.get(renderId);
    expect(queuedJob?.status).toBe("queued");

    // 2. Worker claims job
    const workerId = "worker-e2e-1";
    const claimedJob = await queue.claim(workerId);
    expect(claimedJob).not.toBeNull();
    expect(claimedJob?.renderId).toBe(renderId);
    expect(claimedJob?.status).toBe("running");
    expect(claimedJob?.workerId).toBe(workerId);

    // Wrapped queue tracking heartbeats with serialized async execution
    let pendingHeartbeat = Promise.resolve();
    const queueWithHeartbeatTracking = {
      heartbeat: async (rId: string, stage: RenderStage) => {
        heartbeats.push({ renderId: rId, stage });
        pendingHeartbeat = pendingHeartbeat.then(() => queue.heartbeat(rId, stage));
        await pendingHeartbeat;
      },
      complete: async (rId: string, outcome: Parameters<typeof queue.complete>[1]) => {
        await pendingHeartbeat;
        await queue.complete(rId, outcome);
      },
      get: queue.get.bind(queue),
    };
    // 3. Worker executes runJob
    await runJob({ pipeline, queue: queueWithHeartbeatTracking }, claimedJob!);

    // 4. Verify queue completion
    const completedJob = await queue.get(renderId);
    expect(completedJob?.status).toBe("succeeded");

    // 5. Verify library artifact
    const manifest = await library.getRun(renderId);
    expect(manifest?.status).toBe("succeeded");
    if (manifest?.status === "succeeded") {
      expect(manifest.renderId).toBe(renderId);
      expect(manifest.artifact.width).toBe(1080);
      expect(manifest.artifact.height).toBe(1920);
      expect(manifest.artifact.formatName).toBe("mp4");
      expect(manifest.artifact.codecName).toBe("h264");
      expect(manifest.artifact.durationMs).toBe(12000);
      expect(manifest.content.hook).toBe("Dell XPS 13 mỏng nhẹ thanh lịch");
    }

    // 6. Verify heartbeats were dispatched
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    expect(heartbeats.some((h) => h.stage === "rendering_video" || h.stage === "generating_content")).toBe(true);

    // 7. Verify render event recorded
    expect(recordedEvents.length).toBe(1);
  });

  it("handles render failure gracefully and transitions job to failed state", async () => {
    const queueRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-queue-fail-"));
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-media-fail-"));
    tempRoots.push(queueRoot, mediaRoot);

    const queue = new FileJobQueue({ root: queueRoot });
    const library = new LocalVideoLibrary(mediaRoot);

    const catalog: Pick<CatalogRepository, "getProductSnapshot"> = {
      async getProductSnapshot() {
        return sampleSnapshot;
      },
    };

    const failingPipeline = new ProductVideoPipeline({
      catalog,
      generateContent: async () => ({
        hook: "Dell XPS 13 mỏng nhẹ",
        caption: "Hiệu năng cao cấp với thiết kế sang trọng và bền bỉ.",
        cta: "Mua ngay",
        model: "gpt-4o-mini",
      }),
      imageResolver: { resolve: async () => null },
      compileStoryboard: () => sampleStoryboard,
      renderer: {
        render: async () => {
          throw new Error("FFmpeg worker process crashed");
        },
      },
      library,
    });

    const failedRenderId = "d0000000-0000-4000-8000-000000000004";
    const job: RenderJob = {
      renderId: failedRenderId,
      productId,
      organizationId: orgId,
      status: "queued",
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    await queue.enqueue(job);

    const claimed = await queue.claim("worker-fail-test");
    expect(claimed).not.toBeNull();

    let pendingFailHeartbeat = Promise.resolve();
    const failQueue = {
      heartbeat: async (rId: string, stage: RenderStage) => {
        pendingFailHeartbeat = pendingFailHeartbeat.then(() => queue.heartbeat(rId, stage));
        await pendingFailHeartbeat;
      },
      complete: async (rId: string, outcome: Parameters<typeof queue.complete>[1]) => {
        await pendingFailHeartbeat;
        await queue.complete(rId, outcome);
      },
      get: queue.get.bind(queue),
    };
    await runJob({ pipeline: failingPipeline, queue: failQueue }, claimed!);
    // Job in queue must be failed
    const failedJob = await queue.get(failedRenderId);
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error?.stage).toBe("rendering_video");

    // Manifest in library must record failure
    const failedManifest = await library.getRun(failedRenderId);
    expect(failedManifest?.status).toBe("failed");
    if (failedManifest?.status === "failed") {
      expect(failedManifest.error.stage).toBe("rendering_video");
    }
  });

  it("recovers stale claimed job and writes WORKER_LOST manifest", async () => {
    const queueRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-queue-stale-"));
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "onevoice-worker-media-stale-"));
    tempRoots.push(queueRoot, mediaRoot);

    const library = new LocalVideoLibrary(mediaRoot);

    const queue = new FileJobQueue({
      root: queueRoot,
      onJobLost: async (lostRenderId) => {
        await library.save(lostRenderId, {
          renderId: lostRenderId,
          status: "failed",
          error: { stage: "rendering_video", code: "WORKER_LOST" },
        });
      },
    });

    const staleRenderId = "e0000000-0000-4000-8000-000000000005";
    const job: RenderJob = {
      renderId: staleRenderId,
      productId,
      organizationId: orgId,
      status: "queued",
      enqueuedAt: "2026-09-01T00:00:00.000Z",
      attempts: 0,
    };
    await queue.enqueue(job);

    // Worker claims job (attempt 0)
    await queue.claim("worker-stale-node");

    // First sweep requeues (attempts 0 -> 1)
    const requeued = await queue.recoverStale(0);
    expect(requeued).toBe(1);

    // Reclaim so the second sweep finds it running and retires it as lost
    await queue.claim("worker-stale-node");

    // Second sweep marks as WORKER_LOST terminal failure
    const retired = await queue.recoverStale(0);
    expect(retired).toBe(1);

    // Job in queue should be marked failed
    const recoveredJob = await queue.get(staleRenderId);
    expect(recoveredJob?.status).toBe("failed");
    expect(recoveredJob?.error?.code).toBe("WORKER_LOST");
    // Library manifest should record WORKER_LOST
    const lostManifest = await library.getRun(staleRenderId);
    expect(lostManifest?.status).toBe("failed");
    if (lostManifest?.status === "failed") {
      expect(lostManifest.error.code).toBe("WORKER_LOST");
    }
  });
});
