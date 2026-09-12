// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedVideoScript } from "@/lib/content/generate-video-script";
import fixture from "@/lib/video/__fixtures__/script-valid.json";
import { ProductScriptSchema } from "@/lib/video/script-schema";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { ProductVideoPipeline } from "./product-video-pipeline";

const script = ProductScriptSchema.parse(fixture);
const scope = { organizationId: "a0000000-0000-0000-0000-000000000001" };
const productId = "b0000000-0000-4000-8000-000000000002";
const snapshot: ProductSnapshot = {
  productId, organizationId: scope.organizationId, name: "Laptop", sku: "LAP-1",
  brand: null, priceVnd: 10_000_000, currency: "VND", stockQuantity: 2,
  collectedAt: null, primaryImageUrl: null, facts: [],
};
const generated: GeneratedVideoScript = {
  script, model: "script-model", attempts: 1,
  content: { hook: "Đúng kịch bản", caption: "Cùng một lần sinh", cta: "Nhắn tin", model: "script-model" },
  usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
};

function harness(template = true) {
  const generateContent = vi.fn(async () => ({
    hook: "Nội dung cũ", caption: "Không được dùng cho template", cta: "Cũ", model: "legacy-model",
  }));
  const generateScript = vi.fn(async () => generated);
  const render = vi.fn(async () => ({
    path: "/private/video.mp4", bytes: 1024, sha256: "a".repeat(64), durationMs: 15000,
    width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4",
    rendererRevision: "onevoice-template-v1" as const, cleanup: async () => {},
  }));
  const save = vi.fn(async () => {});
  const record = vi.fn(async () => {});
  const pipeline = new ProductVideoPipeline({
    catalog: { getProductSnapshot: async () => snapshot },
    generateContent, ...(template ? { generateScript } : {}),
    imageResolver: { resolve: async () => null }, compileStoryboard: compileProductStoryboard,
    renderer: { render }, library: { save }, recordEvent: { record },
  });
  const create = () => pipeline.create({ renderId: "b0000000-0000-4000-8000-000000000001", productId, scope });
  return { create, generateContent, generateScript, render, record, save };
}

describe("one generation per product video", () => {
  it("uses the same generated result for template content, rendering and usage", async () => {
    const h = harness();
    const result = await h.create();
    expect(result.status).toBe("succeeded");
    expect(h.generateScript).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(result.content).toEqual({ hook: generated.content.hook, caption: generated.content.caption, cta: generated.content.cta });
    expect(h.render).toHaveBeenCalledWith(expect.objectContaining({ script: generated.script, snapshot }));
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({
      model: generated.model, usage: generated.usage, sceneCount: script.scenes.length,
      scriptSha256: createHash("sha256").update(JSON.stringify(script)).digest("hex"),
    }), expect.anything());
  });

  it("records generation failure without calling another generator or renderer", async () => {
    const h = harness();
    h.generateScript.mockRejectedValueOnce(new Error("provider unavailable"));
    const result = await h.create();
    expect(result).toMatchObject({ status: "failed", error: { stage: "generating_content", code: "AI_GENERATION_FAILED" } });
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.render).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy content generation when no template generator is configured", async () => {
    const h = harness(false);
    const result = await h.create();
    expect(result.status).toBe("succeeded");
    expect(h.generateContent).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(h.generateScript).not.toHaveBeenCalled();
    expect(h.render).toHaveBeenCalledWith(expect.objectContaining({ storyboard: expect.anything() }));
  });
});
