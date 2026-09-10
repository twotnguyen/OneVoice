// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import type { ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedProductContent } from "@/lib/content/types";
import {
  ProductVideoPipeline,
  type RenderEventInput,
} from "@/lib/render/product-video-pipeline";
import type { RenderRun, RenderStage } from "@/lib/render/types";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import type { ResolvedAsset } from "@/lib/video/types";
import { SupabaseRenderEventStore } from "./render-event-store";

const ORG = "a0000000-0000-0000-0000-000000000001";
const renderId = "b0000000-0000-4000-8000-000000000001";
const productId = "b0000000-0000-4000-8000-000000000002";
const scope = { organizationId: ORG };
const snapshot: ProductSnapshot = {
  productId,
  organizationId: ORG,
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

const input: RenderEventInput = {
  renderId,
  productId,
  status: "succeeded",
  model: "test-model",
  timings: { loading_product_ms: 3 },
  totalDurationMs: 42,
  videoBytes: 1024,
  videoDurationMs: 12_000,
  createdAt: new Date("2026-09-10T00:00:00.000Z").toISOString(),
};

function stubFetch(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function storeFor(status: number, body: unknown): SupabaseRenderEventStore {
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: stubFetch(status, body) as typeof fetch },
  });
  return new SupabaseRenderEventStore(client, ORG);
}

describe("SupabaseRenderEventStore.record", () => {
  it.each([
    ["403 RLS", 403, { code: "42501", message: "denied" }],
    ["23503 FK", 409, { code: "23503", message: "FK violation" }],
    ["503", 503, { code: "500", message: "unavailable" }],
  ])("throws on %s", async (_name, status, body) => {
    const store = storeFor(status, body);
    await expect(
      store.record(input, { signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow();
  });

  it("driven through terminate(): baseline RenderRun, one diagnostic, no extra stage", async () => {
    const store = storeFor(403, { code: "42501", message: "denied" });
    const events: string[] = [];
    const stages: RenderStage[] = [];
    const diagnostics: unknown[] = [];
    const asset: ResolvedAsset = {
      path: "/private/work/image.png",
      mimeType: "image/png",
      bytes: 32,
      sha256: "b".repeat(64),
      cleanup: async () => {
        events.push("asset:cleanup");
      },
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
      cleanup: async () => {
        events.push("video:cleanup");
      },
    } as const;
    const pipeline = new ProductVideoPipeline({
      catalog: {
        async getProductSnapshot() {
          events.push("catalog");
          return snapshot;
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
        async render() {
          events.push("render");
          return { ...video };
        },
      },
      library: {
        async save() {
          events.push("save:succeeded");
        },
      },
      diagnostic: (event) => {
        diagnostics.push(event);
      },
      recordEvent: store,
      renderEventTimeoutMs: 1000,
    });

    const result: RenderRun = await pipeline.create({
      renderId,
      productId,
      scope,
      onStage: (stage) => stages.push(stage),
    });

    expect(result.status).toBe("succeeded");
    expect(stages).toEqual([
      "loading_product",
      "generating_content",
      "resolving_asset",
      "rendering_video",
      "storing_artifact",
    ]);
    expect(diagnostics).toEqual([
      { stage: "storing_artifact", code: "RENDER_EVENT_WRITE_FAILED" },
    ]);
    expect(events).toEqual([
      "catalog",
      "content",
      "image",
      "render",
      "save:succeeded",
      "video:cleanup",
      "asset:cleanup",
    ]);
  });
});
