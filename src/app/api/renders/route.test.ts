// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { StoredVideo, VideoManifest } from "@/lib/video/types";
import { createRenderStatusRoute } from "./[renderId]/route";
import { createDownloadRoute } from "./[renderId]/download/route";
import { createVideoRoute } from "./[renderId]/video/route";
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

describe("POST /api/renders", () => {
  it("returns 201 with public URLs made only from the render UUID", async () => {
    const route = createRendersRoute({
      scope,
      pipeline: { async create() { return success; } },
    });

    const response = await route.POST(renderRequest({ renderId, productId, organizationId: "attacker" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ...success,
      urls: {
        status: `/api/renders/${renderId}`,
        video: `/api/renders/${renderId}/video`,
        download: `/api/renders/${renderId}/download`,
      },
    });
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
});

describe("render artifact routes", () => {
  it("returns a saved safe manifest and 404 for a missing run", async () => {
    const found = createRenderStatusRoute({ library: { async getRun() { return success; } } });
    const missing = createRenderStatusRoute({ library: { async getRun() { return null; } } });
    expect((await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) })).status).toBe(200);
    expect((await missing.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId }) })).status).toBe(404);
    expect((await found.GET(new Request("http://localhost"), { params: Promise.resolve({ renderId: "../bad" }) })).status).toBe(404);
  });

  function videoLibrary(bytes = Buffer.from("0123456789")) {
    let closed = 0;
    let reads = 0;
    const stored = {
      size: bytes.length,
      handle: {
        async read(buffer: Buffer, offset: number, length: number, position: number) {
          reads += 1;
          const chunk = bytes.subarray(position, position + length);
          chunk.copy(buffer, offset);
          return { bytesRead: chunk.length, buffer };
        },
        async close() { closed += 1; },
      },
    } as unknown as StoredVideo;
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

  it("closes the handle on invalid range, HEAD, and cancellation", async () => {
    const invalidFile = videoLibrary();
    const invalid = await createVideoRoute({ library: invalidFile.library }).GET(
      new Request("http://localhost", { headers: { Range: "bytes=20-30" } }),
      { params: Promise.resolve({ renderId }) },
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
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
