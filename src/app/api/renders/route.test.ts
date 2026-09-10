// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { StoredVideo, VideoManifest } from "@/lib/video/types";
import { RenderProgressStore } from "@/lib/render/progress-store";
import { MAX_CONCURRENT_RENDERS, RenderGate } from "@/lib/render/render-gate";
import { createRenderStatusRoute } from "./[renderId]/route";
import { createDownloadRoute, createVideoRoute } from "@/lib/video/media-response";
import { createRendersRoute } from "./route";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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

describe("POST /api/renders", () => {
  it("returns 201 with public URLs made only from the render UUID", async () => {
    const route = createRendersRoute({
      scope,
      pipeline: { async create() { return success; } },
    });

    const response = await route.POST(renderRequest({ renderId, productId, organizationId: "attacker" }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toEqual({
      renderId,
      status: "succeeded",
      content: success.content,
      urls: {
        status: `/api/renders/${renderId}`,
        video: `/api/renders/${renderId}/video`,
        download: `/api/renders/${renderId}/download`,
      },
    });
    // The wire view drops the persistence-only artifact block.
    expect(payload).not.toHaveProperty("artifact");
  });

  it("rejects malformed identifiers", async () => {
    const route = createRendersRoute({ scope, pipeline: { async create() { return success; } } });
    const response = await route.POST(renderRequest({ renderId: "../secret", productId }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it.each([
    ["PRODUCT_NOT_FOUND", "loading_product", 404],
    ["AI_GENERATION_FAILED", "generating_content", 502],
    ["IMAGE_RESOLUTION_FAILED", "resolving_asset", 500],
    ["VIDEO_RENDER_FAILED", "rendering_video", 500],
    ["STORAGE_FAILED", "storing_artifact", 500],
  ] as const)("maps %s to a safe response", async (code, stage, status) => {
    const route = createRendersRoute({
      scope,
      pipeline: { async create() { return { renderId, status: "failed", error: { code, stage } } as VideoManifest; } },
    });
    const response = await route.POST(renderRequest({ renderId, productId }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, stage } });
  });

  it("rejects a replayed renderId with 409 and never runs the pipeline", async () => {
    let created = 0;
    const route = createRendersRoute({
      scope,
      library: { async getRun() { return success; } },
      pipeline: { async create() { created += 1; return success; } },
    });

    const response = await route.POST(renderRequest({ renderId, productId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "RENDER_ID_IN_USE" } });
    expect(created).toBe(0);
  });

  it("rejects a concurrent POST for the same renderId with a single 409", async () => {
    const gate = new RenderGate();
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let created = 0;
    const route = createRendersRoute({
      scope,
      gate,
      pipeline: { async create() { created += 1; await firstPending; return success; } },
    });

    const first = route.POST(renderRequest({ renderId, productId }));
    const second = await route.POST(renderRequest({ renderId, productId }));

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: { code: "RENDER_ID_IN_USE" } });

    releaseFirst();
    expect((await first).status).toBe(201);
    expect(created).toBe(1);
  });

  it("serialises pipeline execution past the concurrency limit", async () => {
    const gate = new RenderGate();
    let started = 0;
    const releases: Array<() => void> = [];
    const route = createRendersRoute({
      scope,
      gate,
      pipeline: {
        async create() {
          started += 1;
          await new Promise<void>((resolve) => releases.push(resolve));
          return success;
        },
      },
    });
    const ids = [1, 2, 3].map((n) => `b0000000-0000-4000-8000-00000000010${n}`);

    const inFlight = ids.map((id) => route.POST(renderRequest({ renderId: id, productId })));
    await tick();
    await tick();
    expect(started).toBe(MAX_CONCURRENT_RENDERS);

    releases[0]();
    await tick();
    await tick();
    expect(started).toBe(3);

    releases.forEach((release) => release());
    expect((await Promise.all(inFlight)).map((response) => response.status)).toEqual([201, 201, 201]);
  });

  it("registers actual pipeline stages and always clears progress", async () => {
    const progress = new RenderProgressStore();
    let observedDuringRun: unknown;
    const route = createRendersRoute({
      scope,
      progress,
      pipeline: {
        async create(command) {
          command.onStage?.("resolving_asset");
          observedDuringRun = progress.get(renderId);
          return success;
        },
      },
    });

    const response = await route.POST(renderRequest({ renderId, productId }));

    expect(response.status).toBe(201);
    expect(observedDuringRun).toEqual({ renderId, status: "running", stage: "resolving_asset" });
    expect(progress.get(renderId)).toBeNull();
  });
});

describe("render artifact routes", () => {
  it("returns a saved safe manifest and 404 for a missing run", async () => {
    const found = createRenderStatusRoute({ library: { async getRun() { return success; } } });
    const missing = createRenderStatusRoute({ library: { async getRun() { return null; } } });
    const foundResponse = await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(foundResponse.status).toBe(200);
    const foundPayload = await foundResponse.json();
    expect(foundPayload).toEqual({ renderId, status: "succeeded", content: success.content });
    expect(foundPayload).not.toHaveProperty("artifact");
    expect((await missing.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) })).status).toBe(404);
    expect((await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId: "../bad" }) })).status).toBe(404);
  });

  it("returns running progress before the terminal manifest", async () => {
    const progress = new RenderProgressStore();
    progress.start(renderId);
    progress.update(renderId, "rendering_video");
    const route = createRenderStatusRoute({
      progress,
      library: { async getRun() { throw new Error("must not read terminal storage"); } },
    });
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ renderId, status: "running", stage: "rendering_video" });
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
