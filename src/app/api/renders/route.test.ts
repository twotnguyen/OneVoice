// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { RenderJob } from "@/lib/queue/types";
import type { RenderStage } from "@/lib/render/types";
import { RenderGate } from "@/lib/render/render-gate";
import { createDownloadRoute, createVideoRoute } from "@/lib/video/media-response";
import type { StoredVideo, VideoManifest } from "@/lib/video/types";
import { createRenderStatusRoute } from "./[renderId]/route";
import { createRendersRoute } from "./route";

const renderId = "b0000000-0000-4000-8000-000000000001";
const productId = "b0000000-0000-4000-8000-000000000002";
const scope = { organizationId: "a0000000-0000-0000-0000-000000000001" };
const success: VideoManifest = {
  renderId,
  status: "succeeded",
  content: { hook: "Một lựa chọn đáng chú ý", caption: "Nội dung đủ dài cho chiến dịch sản phẩm.", cta: "Xem sản phẩm ngay" },
  artifact: {
    bytes: 10,
    sha256: "a".repeat(64),
    durationMs: 12_000,
    width: 1080,
    height: 1920,
    codecName: "h264",
    pixelFormat: "yuv420p",
    formatName: "mp4",
    rendererRevision: "onevoice-ffmpeg-v1",
  },
};

function renderRequest(body: unknown) {
  return new Request("http://localhost/api/renders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createFakeQueue() {
  const jobs = new Map<string, RenderJob>();
  return {
    jobs,
    async enqueue(job: RenderJob) {
      if (jobs.has(job.renderId)) throw new Error("JOB_EXISTS");
      jobs.set(job.renderId, job);
    },
    async get(id: string) {
      return jobs.get(id) ?? null;
    },
    async claim() { return null; },
    async heartbeat(id: string, stage: RenderStage) {
      const j = jobs.get(id);
      if (j) jobs.set(id, { ...j, status: "running", stage });
    },
    async complete() {},
    async recoverStale() { return 0; },
  };
}

describe("POST /api/renders", () => {
  it("returns 202 with public URLs and enqueues the job without calling the pipeline", async () => {
    const queue = createFakeQueue();
    const route = createRendersRoute({
      scope,
      queue,
    });

    const response = await route.POST(renderRequest({ renderId, productId, organizationId: "attacker" }));

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({
      renderId,
      status: "queued",
      urls: {
        status: `/api/renders/${renderId}`,
        video: `/api/renders/${renderId}/video`,
        download: `/api/renders/${renderId}/download`,
      },
    });
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(renderId)).toMatchObject({
      renderId,
      productId,
      organizationId: scope.organizationId,
      status: "queued",
    });
  });

  it("rejects malformed identifiers", async () => {
    const queue = createFakeQueue();
    const route = createRendersRoute({ scope, queue });
    const response = await route.POST(renderRequest({ renderId: "../secret", productId }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it("rejects a replayed renderId with 409 and never enqueues to the queue", async () => {
    const queue = createFakeQueue();
    const route = createRendersRoute({
      scope,
      queue,
      library: { async getRun() { return success; } },
    });

    const response = await route.POST(renderRequest({ renderId, productId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "RENDER_ID_IN_USE" } });
    expect(queue.jobs.size).toBe(0);
  });

  it("rejects duplicating an already-queued renderId with 409 RENDER_ID_IN_USE (C12c)", async () => {
    const queue = createFakeQueue();
    const route = createRendersRoute({ scope, queue });

    const first = await route.POST(renderRequest({ renderId, productId }));
    expect(first.status).toBe(202);

    const second = await route.POST(renderRequest({ renderId, productId }));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: { code: "RENDER_ID_IN_USE" } });
  });

  it("rejects a concurrent POST for the same renderId with a single 409", async () => {
    const gate = new RenderGate();
    const queue = createFakeQueue();
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const route = createRendersRoute({
      scope,
      gate,
      queue: {
        async enqueue(job) {
          await firstPending;
          await queue.enqueue(job);
        },
      },
    });

    const first = route.POST(renderRequest({ renderId, productId }));
    const second = await route.POST(renderRequest({ renderId, productId }));

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: { code: "RENDER_ID_IN_USE" } });

    releaseFirst();
    expect((await first).status).toBe(202);
    expect(queue.jobs.size).toBe(1);
  });
});

describe("render artifact routes", () => {
  it("resolves GET in order: library -> queue -> 404", async () => {
    const queue = createFakeQueue();
    let savedRun: VideoManifest | null = null;
    const route = createRenderStatusRoute({
      library: { async getRun(id) { return id === renderId ? savedRun : null; } },
      queue,
    });

    // 1. Not in library or queue -> 404
    const notFound = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(notFound.status).toBe(404);

    // 2. In queue as queued -> { renderId, status: "queued" }
    await queue.enqueue({
      renderId,
      productId,
      organizationId: scope.organizationId,
      status: "queued",
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    });
    const queuedResp = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(queuedResp.status).toBe(200);
    expect(await queuedResp.json()).toEqual({ renderId, status: "queued" });

    // 3. Queue flips to running with stage -> { renderId, status: "running", stage: "rendering_video" }
    await queue.heartbeat(renderId, "rendering_video");
    const runningResp = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(runningResp.status).toBe(200);
    expect(await runningResp.json()).toEqual({ renderId, status: "running", stage: "rendering_video" });

    // 4. Saved to library -> terminal view
    savedRun = success;
    const terminalResp = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(terminalResp.status).toBe(200);
    expect(await terminalResp.json()).toEqual({
      renderId,
      status: "succeeded",
      content: success.content,
      durationSeconds: 12,
    });
  });

  it("returns terminal failed view with WORKER_LOST for a retired job (M1 end-to-end)", async () => {
    const lostRun: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "WORKER_LOST" },
    };
    const route = createRenderStatusRoute({
      library: { async getRun(id) { return id === renderId ? lostRun : null; } },
    });
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "WORKER_LOST" },
    });
  });
  it("returns a saved safe manifest and 404 for a missing run", async () => {
    const found = createRenderStatusRoute({ library: { async getRun() { return success; } } });
    const missing = createRenderStatusRoute({ library: { async getRun() { return null; } } });
    const foundResponse = await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(foundResponse.status).toBe(200);
    const foundPayload = await foundResponse.json();
    expect(foundPayload).toEqual({ renderId, status: "succeeded", content: success.content, durationSeconds: 12 });
    expect(foundPayload).not.toHaveProperty("artifact");
    expect((await missing.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) })).status).toBe(404);
    expect((await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId: "../bad" }) })).status).toBe(404);
  });


  it("returns safe 500 for status storage exceptions", async () => {
    const diagnostics: unknown[] = [];
    const route = createRenderStatusRoute({
      diagnostic: (event) => diagnostics.push(event),
      library: { async getRun() { throw new Error("corrupt /private/manifest secret"); } },
    });
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "STORAGE_UNAVAILABLE" } });
    expect(diagnostics).toEqual([{ stage: "media", code: "STORAGE_UNAVAILABLE" }]);
  });

  function videoLibrary(bytes = Buffer.from("0123456789"), options: { closeError?: Error; readError?: Error } = {}) {
    let closed = 0;
    let reads = 0;
    let closePromise: Promise<void> | undefined;
    const stored: StoredVideo = {
      size: bytes.length,
      async *stream(start: number, end: number) {
        let position = start;
        while (position <= end) {
          reads += 1;
          if (options.readError) throw options.readError;
          const chunk = bytes.subarray(position, Math.min(position + 64 * 1024, end + 1));
          if (chunk.length === 0) throw new Error("Video artifact ended unexpectedly");
          position += chunk.length;
          yield new Uint8Array(chunk);
        }
      },
      close() {
        return (closePromise ??= (async () => {
          closed += 1;
          if (options.closeError) throw options.closeError;
        })());
      },
    };
    return {
      library: { async readVideo() { return stored; } },
      closed: () => closed,
      reads: () => reads,
    };
  }

  it("streams the already-open handle as full and partial private media", async () => {
    const fullFile = videoLibrary();
    const full = await createVideoRoute({ library: fullFile.library }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    expect(full.status).toBe(200);
    expect(await full.text()).toBe("0123456789");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fullFile.closed()).toBe(1);

    const partialFile = videoLibrary();
    const partial = await createVideoRoute({ library: partialFile.library }).GET(
      new Request("http://localhost", { headers: { Range: "bytes=2-5" } }),
      { params: Promise.resolve({ renderId }) },
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await partial.text()).toBe("2345");
    expect(partialFile.closed()).toBe(1);
  });

  it("returns safe 500 for media library exceptions", async () => {
    const diagnostics: unknown[] = [];
    const route = createVideoRoute({
      diagnostic: (event) => diagnostics.push(event),
      library: { async readVideo() { throw new Error("unsafe /private/video secret"); } },
    });
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "STORAGE_UNAVAILABLE" } });
    expect(diagnostics).toEqual([{ stage: "media", code: "STORAGE_UNAVAILABLE" }]);
  });

  it("returns safe 500 for an invalid stored artifact size", async () => {
    const file = videoLibrary(Buffer.alloc(0));
    const diagnostics: unknown[] = [];
    const response = await createVideoRoute({ ...file, diagnostic: (event) => diagnostics.push(event) }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "STORAGE_UNAVAILABLE" } });
    expect(file.closed()).toBe(1);
    expect(diagnostics).toEqual([{ stage: "media", code: "STORAGE_UNAVAILABLE" }]);
  });

  it("returns safe 500 when pre-response close fails", async () => {
    const file = videoLibrary(undefined, { closeError: new Error("close /private/secret") });
    const diagnostics: unknown[] = [];
    const route = createVideoRoute({ ...file, diagnostic: (event) => diagnostics.push(event) });
    const response = await route.HEAD(new Request("http://localhost", { method: "HEAD" }), { params: Promise.resolve({ renderId }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "STORAGE_UNAVAILABLE" } });
    expect(file.closed()).toBe(1);
    expect(diagnostics).toEqual([{ stage: "media", code: "CLOSE_FAILED" }]);
  });

  it("diagnoses close failure after streaming starts and errors the stream", async () => {
    const file = videoLibrary(undefined, { closeError: new Error("close /private/secret") });
    const diagnostics: unknown[] = [];
    const response = await createVideoRoute({ ...file, diagnostic: (event) => diagnostics.push(event) }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    await expect(response.text()).rejects.toThrow();
    expect(file.closed()).toBe(1);
    expect(diagnostics).toEqual([{ stage: "media", code: "CLOSE_FAILED" }]);
  });

  it("closes and errors safely on read failure", async () => {
    const file = videoLibrary(undefined, { readError: new Error("read /private/secret") });
    const response = await createVideoRoute(file).GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    await expect(response.text()).rejects.toThrow();
    expect(file.closed()).toBe(1);
  });

  it("completes cancellation and diagnoses a rejected shared close", async () => {
    const file = videoLibrary(Buffer.alloc(200_000, 1), { closeError: new Error("close /private/secret") });
    const diagnostics: unknown[] = [];
    const response = await createVideoRoute({ ...file, diagnostic: (event) => diagnostics.push(event) }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    const reader = response.body!.getReader();
    await reader.read();
    await expect(reader.cancel()).resolves.toBeUndefined();
    expect(file.closed()).toBe(1);
    expect(diagnostics).toEqual([{ stage: "media", code: "CLOSE_FAILED" }]);
  });

  it("closes the handle on invalid range, HEAD, and cancellation", async () => {
    const invalidFile = videoLibrary();
    const invalid = await createVideoRoute({ library: invalidFile.library }).GET(
      new Request("http://localhost", { headers: { Range: "bytes=20-30" } }),
      { params: Promise.resolve({ renderId }) },
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
    expect(invalid.headers.get("content-type")).toBeNull();
    expect(invalidFile.closed()).toBe(1);

    const headFile = videoLibrary();
    const head = await createVideoRoute({ library: headFile.library }).HEAD(
      new Request("http://localhost", { method: "HEAD" }),
      { params: Promise.resolve({ renderId }) },
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(headFile.closed()).toBe(1);

    const cancelledFile = videoLibrary(Buffer.alloc(200_000, 1));
    const response = await createVideoRoute({ library: cancelledFile.library }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(cancelledFile.closed()).toBe(1);
  });

  it("sets a sanitized attachment filename and returns 404 for missing artifacts", async () => {
    const file = videoLibrary();
    const response = await createDownloadRoute({ library: file.library }).GET(
      new Request("http://localhost"), { params: Promise.resolve({ renderId }) },
    );
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="onevoice-${renderId}.mp4"`);
    await response.arrayBuffer();
    expect(file.closed()).toBe(1);

    const missing = createVideoRoute({ library: { async readVideo() { return null; } } });
    expect((await missing.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) })).status).toBe(404);
    expect((await missing.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId: "bad" }) })).status).toBe(404);
  });
});
