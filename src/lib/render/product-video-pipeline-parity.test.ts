// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedProductContent } from "@/lib/content/types";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import type { RenderedVideo, ResolvedAsset, VideoRenderRequest } from "@/lib/video/types";
import {
  ProductVideoPipeline,
  type RenderEventInput,
  type RenderEventStore,
} from "./product-video-pipeline";
import type { RenderRun, RenderStage } from "./types";

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
const video = {
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
} as const;

function harness(options: {
  product?: ProductSnapshot | null;
  recordEvent?: RenderEventStore;
} = {}) {
  const events: string[] = [];
  const diagnostics: unknown[] = [];
  const rows: RenderEventInput[] = [];
  const asset: ResolvedAsset = {
    path: "/private/work/image.png",
    mimeType: "image/png",
    bytes: 32,
    sha256: "b".repeat(64),
    cleanup: async () => {
      events.push("asset:cleanup");
    },
  };
  const pipeline = new ProductVideoPipeline({
    catalog: {
      async getProductSnapshot() {
        events.push("catalog");
        return options.product === undefined ? snapshot : options.product;
      },
    },
    generateContent: async () => {
      events.push("content");
      return content;
    },
    imageResolver: {
      async resolve() {
        events.push("image");
        return asset;
      },
    },
    compileStoryboard: compileProductStoryboard,
    renderer: {
      async render(request: VideoRenderRequest): Promise<RenderedVideo> {
        void request;
        events.push("render");
        return { ...video, cleanup: async () => { events.push("video:cleanup"); } };
      },
    },
    library: {
      async save(_id, manifest) {
        events.push(`save:${manifest.status}`);
      },
    },
    diagnostic: (event) => { diagnostics.push(event); },
    recordEvent: options.recordEvent ?? {
      async record(input: RenderEventInput) {
        rows.push(input);
      },
    },
    renderEventTimeoutMs: 50,
  });
  return { pipeline, events, diagnostics, rows };
}

async function baselineRun(): Promise<{ result: RenderRun; stages: RenderStage[]; events: string[] }> {
  const test = harness();
  const stages: RenderStage[] = [];
  const result = await test.pipeline.create({
    renderId, productId, scope, onStage: (stage) => stages.push(stage),
  });
  return { result, stages, events: test.events };
}

describe("ProductVideoPipeline terminate() parity", () => {
  it("records a full timing map + model on success with no extra stage or ledger entry", async () => {
    const test = harness();
    const stages: RenderStage[] = [];

    const result = await test.pipeline.create({
      renderId, productId, scope, onStage: (stage) => stages.push(stage),
    });

    expect(result.status).toBe("succeeded");
    expect(stages).toEqual([
      "loading_product", "generating_content", "resolving_asset",
      "rendering_video", "storing_artifact",
    ]);
    expect(test.events).toEqual([
      "catalog", "content", "image", "render", "save:succeeded",
      "video:cleanup", "asset:cleanup",
    ]);
    expect(test.diagnostics).toEqual([]);
    expect(test.rows).toHaveLength(1);
    const row = test.rows[0];
    expect(Object.keys(row.timings).sort()).toEqual([
      "generating_content_ms", "loading_product_ms", "rendering_video_ms",
      "resolving_asset_ms", "storing_artifact_ms",
    ]);
    expect(row.productId).toBe(productId);
    expect(row.model).toBe("test-model");
    expect(row.status).toBe("succeeded");
    expect(row.videoBytes).toBe(1_024);
    expect(typeof row.totalDurationMs).toBe("number");
    expect(typeof row.createdAt).toBe("string");
  });

  it("records only run stages on an early failure", async () => {
    const test = harness({ product: null });

    const result = await test.pipeline.create({ renderId, productId, scope });

    expect(result).toEqual({
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    });
    expect(test.rows).toHaveLength(1);
    expect(Object.keys(test.rows[0].timings)).toEqual(["loading_product_ms"]);
    expect(test.rows[0].productId).toBe(productId);
    expect(test.diagnostics).toEqual([]);
  });

  it.each([
    ["sync throw", () => ({ record() { throw new Error("boom"); } })],
    ["async rejection", () => ({ async record() { throw new Error("boom"); } })],
    ["signal-ignoring never-resolving", () => ({ record() { return new Promise<never>(() => {}); } })],
  ] as const)("returns the baseline run with one diagnostic when recordEvent %s", async (_name, make) => {
    const baseline = await baselineRun();
    const test = harness({ recordEvent: make() as RenderEventStore });
    const stages: RenderStage[] = [];

    const start = performance.now();
    const result = await test.pipeline.create({
      renderId, productId, scope, onStage: (stage) => stages.push(stage),
    });
    const wallMs = performance.now() - start;

    expect(result).toEqual(baseline.result);
    expect(stages).toEqual(baseline.stages);
    expect(test.events).toEqual(baseline.events);
    expect(wallMs).toBeLessThan(_name === "signal-ignoring never-resolving" ? 200 : 100);
    expect(test.diagnostics).toEqual([
      { stage: "storing_artifact", code: "RENDER_EVENT_WRITE_FAILED" },
    ]);
  });
});
