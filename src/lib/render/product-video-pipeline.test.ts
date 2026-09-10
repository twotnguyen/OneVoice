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
import type { TemplateRenderRequest } from "@/lib/video/template-video-renderer";
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
  imageResult?: ResolvedAsset | null;
  renderError?: Error;
  storageError?: Error;
  storageAlwaysRejects?: boolean;
  assetCleanupError?: Error;
  videoCleanupError?: Error;
} = {}) {
  const events: string[] = [];
  const manifests: VideoManifest[] = [];
  let storageAttempts = 0;
  const asset: ResolvedAsset = {
    path: "/private/work/image.png",
    mimeType: "image/png",
    bytes: 32,
    sha256: "b".repeat(64),
    cleanup: async () => {
      events.push("asset:cleanup");
      if (options.assetCleanupError) throw options.assetCleanupError;
    },
  };
  const video = {
    ...renderedVideo,
    cleanup: async () => {
      events.push("video:cleanup");
      if (options.videoCleanupError) throw options.videoCleanupError;
    },
  };
  let renderRequest: VideoRenderRequest | TemplateRenderRequest | undefined;
  const diagnostics: unknown[] = [];

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
        return options.imageResult === undefined ? asset : options.imageResult;
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
        if (options.storageAlwaysRejects || (options.storageError && storageAttempts === 1)) {
          throw options.storageError ?? new Error("always unavailable /private/secret");
        }
        manifests.push(manifest);
      },
    },
    diagnostic: (event) => { diagnostics.push(event); },
  });

  return { pipeline, events, manifests, diagnostics, getRenderRequest: () => renderRequest };
}

describe("ProductVideoPipeline", () => {
  it("sequences a product into one stored three-scene MP4 and cleans temporary files", async () => {
    const test = harness();

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result.status).toBe("succeeded");
    const request = test.getRenderRequest();
    expect(request && "storyboard" in request ? request.storyboard.scenes : []).toHaveLength(3);
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
    const test = harness({ imageResult: null });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result.status).toBe("succeeded");
    expect(test.getRenderRequest()).not.toHaveProperty("imagePath");
    expect(test.events).toEqual([
      "catalog", "content", "image", "render", "save:succeeded", "video:cleanup",
    ]);
  });

  it("maps a thrown image resolver failure without exposing its message", async () => {
    const test = harness({ imageError: new Error("ffprobe /private/secret failed") });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result).toEqual({
      renderId,
      status: "failed",
      content: { hook: content.hook, caption: content.caption, cta: content.cta },
      error: { stage: "resolving_asset", code: "IMAGE_RESOLUTION_FAILED" },
    });
    expect(test.manifests).toEqual([result]);
    expect(JSON.stringify(result)).not.toMatch(/ffprobe|private|secret/);
  });

  it("returns STORAGE_FAILED when even the failure manifest cannot be saved", async () => {
    const test = harness({ product: null, storageAlwaysRejects: true });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result).toEqual({
      renderId,
      status: "failed",
      error: { stage: "storing_artifact", code: "STORAGE_FAILED" },
    });
    expect(test.manifests).toEqual([]);
    expect(test.diagnostics).toEqual([{ stage: "storing_artifact", code: "STORAGE_FAILED" }]);
  });

  it("emits every real stage through the pipeline callback", async () => {
    const test = harness();
    const stages: string[] = [];

    await test.pipeline.create({ renderId, productId, scope, onStage: (stage) => stages.push(stage) });

    expect(stages).toEqual([
      "loading_product", "generating_content", "resolving_asset",
      "rendering_video", "storing_artifact",
    ]);
  });

  it("emits storing when persisting a terminal failure", async () => {
    const test = harness({ contentError: new Error("provider unavailable") });
    const stages: string[] = [];
    await test.pipeline.create({ renderId, productId, scope, onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(["loading_product", "generating_content", "storing_artifact"]);
  });

  it("reports rejected asset and video cleanup with code-only diagnostics", async () => {
    const test = harness({
      assetCleanupError: new Error("asset /private/secret"),
      videoCleanupError: new Error("video /private/secret"),
    });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result.status).toBe("succeeded");
    expect(test.diagnostics).toEqual([
      { stage: "rendering_video", code: "CLEANUP_FAILED" },
      { stage: "resolving_asset", code: "CLEANUP_FAILED" },
    ]);
    expect(JSON.stringify(test.diagnostics)).not.toContain("private");
  });
});
