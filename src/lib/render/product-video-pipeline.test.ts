// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedProductContent } from "@/lib/content/types";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import type {
  RenderedVideo,
  ResolvedAsset,
  VideoManifest,
  VideoRenderRequest,
} from "@/lib/video/types";
import { ProductVideoPipeline } from "./product-video-pipeline";

const renderId = "b0000000-0000-4000-8000-000000000001";
const productId = "b0000000-0000-4000-8000-000000000002";
const scope = { organizationId: "a0000000-0000-0000-0000-000000000001" };
const snapshot: ProductSnapshot = {
  productId,
  organizationId: scope.organizationId,
  name: "ThinkPad X1 Carbon Gen 12",
  sku: "TP-X1-12",
  brand: "Lenovo",
  priceVnd: 42_990_000,
  currency: "VND",
  stockQuantity: 3,
  collectedAt: "2026-09-09T00:00:00.000Z",
  primaryImageUrl: "https://product.hstatic.net/x1.png",
  facts: [],
};
const content: GeneratedProductContent = {
  hook: "Hiệu năng gọn trong một thiết kế bền bỉ",
  caption: "ThinkPad X1 Carbon cho nhịp làm việc linh hoạt mỗi ngày.",
  cta: "Khám phá sản phẩm hôm nay",
  model: "test-model",
};
const renderedVideo: RenderedVideo = {
  path: "/private/work/video.mp4",
  bytes: 1_024,
  sha256: "a".repeat(64),
  durationMs: 12_000,
  width: 1080,
  height: 1920,
  codecName: "h264",
  pixelFormat: "yuv420p",
  formatName: "mp4",
  rendererRevision: "onevoice-ffmpeg-v1",
  cleanup: async () => undefined,
};

function harness(options: {
  product?: ProductSnapshot | null;
  contentError?: Error;
  imageError?: Error;
  renderError?: Error;
  storageError?: Error;
} = {}) {
  const events: string[] = [];
  const manifests: VideoManifest[] = [];
  let storageAttempts = 0;
  const asset: ResolvedAsset = {
    path: "/private/work/image.png",
    mimeType: "image/png",
    bytes: 32,
    sha256: "b".repeat(64),
    cleanup: async () => { events.push("asset:cleanup"); },
  };
  const video = {
    ...renderedVideo,
    cleanup: async () => { events.push("video:cleanup"); },
  };
  let renderRequest: VideoRenderRequest | undefined;

  const pipeline = new ProductVideoPipeline({
    catalog: {
      async getProductSnapshot() {
        events.push("catalog");
        return options.product === undefined ? snapshot : options.product;
      },
    },
    generateContent: async () => {
      events.push("content");
      if (options.contentError) throw options.contentError;
      return content;
    },
    imageResolver: {
      async resolve() {
        events.push("image");
        if (options.imageError) throw options.imageError;
        return asset;
      },
    },
    compileStoryboard: compileProductStoryboard,
    renderer: {
      async render(request) {
        events.push("render");
        renderRequest = request;
        if (options.renderError) throw options.renderError;
        return video;
      },
    },
    library: {
      async save(_id, manifest) {
        events.push(`save:${manifest.status}`);
        storageAttempts += 1;
        if (options.storageError && storageAttempts === 1) throw options.storageError;
        manifests.push(manifest);
      },
    },
  });

  return { pipeline, events, manifests, getRenderRequest: () => renderRequest };
}

describe("ProductVideoPipeline", () => {
  it("sequences a product into one stored three-scene MP4 and cleans temporary files", async () => {
    const test = harness();

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result.status).toBe("succeeded");
    expect(test.getRenderRequest()?.storyboard.scenes).toHaveLength(3);
    expect(test.manifests).toEqual([result]);
    expect(JSON.stringify(result)).not.toContain("/private/");
    expect(test.events).toEqual([
      "catalog", "content", "image", "render", "save:succeeded",
      "video:cleanup", "asset:cleanup",
    ]);
  });

  it("returns PRODUCT_NOT_FOUND, persists failure, and never generates content", async () => {
    const test = harness({ product: null });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result).toEqual({
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    });
    expect(test.manifests).toEqual([result]);
    expect(test.events).toEqual(["catalog", "save:failed"]);
  });

  it.each([
    ["AI", { contentError: new Error("provider body secret-token") }, "generating_content", "AI_GENERATION_FAILED"],
    ["FFmpeg", { renderError: new Error("/private/work/video.mp4 secret-token") }, "rendering_video", "VIDEO_RENDER_FAILED"],
    ["storage", { storageError: new Error("/private/media secret-token") }, "storing_artifact", "STORAGE_FAILED"],
  ] as const)("maps %s failures to safe persisted errors", async (_name, options, stage, code) => {
    const test = harness(options);

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result).toEqual({ renderId, status: "failed", error: { stage, code }, ...(stage === "generating_content" ? {} : { content: { hook: content.hook, caption: content.caption, cta: content.cta } }) });
    expect(test.manifests.at(-1)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/secret-token|\/private\//);
    if (stage !== "generating_content") expect(test.events).toContain("asset:cleanup");
    if (stage === "storing_artifact") expect(test.events).toContain("video:cleanup");
  });

  it("treats image resolution failure as a text-only success", async () => {
    const test = harness({ imageError: new Error("unavailable") });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result.status).toBe("succeeded");
    expect(test.getRenderRequest()).not.toHaveProperty("imagePath");
    expect(test.events).toEqual([
      "catalog", "content", "image", "render", "save:succeeded", "video:cleanup",
    ]);
  });
});
