// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { ProductSnapshot } from "../catalog/types";
import type { GeneratedProductContent } from "../content/types";
import { compileProductStoryboard } from "./storyboard";

const snapshot: ProductSnapshot = {
  productId: "product-1",
  organizationId: "organization-1",
  name: "Laptop ASUS ROG Zephyrus G14",
  sku: "GA403UV-QS170W",
  brand: "ASUS",
  priceVnd: 30_000_000,
  currency: "VND",
  stockQuantity: 4,
  collectedAt: "2026-08-31T00:00:00Z",
  primaryImageUrl: null,
  facts: [
    { ref: "cpu", label: "CPU", value: "AMD Ryzen 9", critical: true },
  ],
};

const content: GeneratedProductContent = {
  hook: "Sẵn sàng cho mọi trận đấu.",
  caption: "Hiệu năng mạnh trong một thiết kế gọn gàng.",
  cta: "Xem thông tin sản phẩm",
  model: "muse-test",
};

describe("compileProductStoryboard", () => {
  it("returns the fixed three-scene product spotlight with application-owned facts", () => {
    expect(compileProductStoryboard(snapshot, content)).toEqual({
      schema: "onevoice.storyboard.v1",
      template: "product-spotlight-v1",
      canvas: { width: 1080, height: 1920, fps: 30, durationMs: 12_000 },
      scenes: [
        {
          kind: "hook",
          durationMs: 4_000,
          lines: ["Sẵn sàng cho mọi", "trận đấu."],
        },
        {
          kind: "facts",
          durationMs: 4_000,
          lines: [
            "Laptop ASUS ROG",
            "Zephyrus G14",
            "30.000.000 ₫",
            "SKU: GA403UV-QS170W",
            "Dữ liệu ngày 31/08/2026",
          ],
        },
        {
          kind: "cta",
          durationMs: 4_000,
          lines: ["Xem thông tin sản", "phẩm"],
        },
      ],
    });
  });

  it("wraps and truncates untrusted copy to bounded lines", () => {
    const result = compileProductStoryboard(snapshot, {
      ...content,
      hook: "một ".repeat(100),
      cta: "xem-ngay ".repeat(100),
    });

    expect(result.scenes[0].lines).toHaveLength(3);
    expect(result.scenes[2].lines).toHaveLength(2);
    for (const scene of result.scenes) {
      for (const line of scene.lines) expect(line.length).toBeLessThanOrEqual(24);
    }
    expect(result.scenes[0].lines[2]).toMatch(/…$/);
    expect(result.scenes[2].lines[1]).toMatch(/…$/);
  });
});
