// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ProductSnapshot } from "../catalog/types";
import type { ProductScript } from "../video/script-schema";
import { formatVietnameseNumber } from "./vi-numerals";
import { checkScriptAgainstSnapshot } from "./truth-guard";

function validScript(): ProductScript {
  return JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../video/__fixtures__/script-valid.json"),
      "utf8",
    ),
  ) as ProductScript;
}

// T2's golden headphone script paired with a snapshot it actually describes:
// 40-hour battery, 98% ANC, ~30M price. Must stay clean or every legitimate
// render blocks.
function goldenSnapshot(): ProductSnapshot {
  return {
    productId: "prod-1",
    organizationId: "org-1",
    name: "Tai nghe chống ồn thế hệ mới",
    sku: "TN-ANC-01",
    brand: "OneVoice",
    priceVnd: 29_990_000,
    currency: "VND",
    stockQuantity: 12,
    collectedAt: "2026-09-01",
    primaryImageUrl: null,
    facts: [
      { ref: "battery", label: "Pin", value: "Pin 40 giờ, sạc nhanh 10 phút dùng cả ngày", critical: true },
      { ref: "anc", label: "Chống ồn", value: "Giảm ồn tới 98% đo trong phòng lab", critical: true },
    ],
  };
}

function mutateScene(script: ProductScript, id: string, patch: Record<string, unknown>): ProductScript {
  return {
    ...script,
    scenes: script.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

// Isolate one scene: drop every other scene so only the planted violation can fire.
function isolateScene(script: ProductScript, id: string): ProductScript {
  return { ...script, scenes: script.scenes.filter((s) => s.id === id) };
}

describe("truth-guard", () => {
  it("catches the spec AC case: spoken price contradicting the snapshot", () => {
    const script = isolateScene(
      mutateScene(validScript(), "body-1", {
        voiceText: "chỉ hai mươi lăm triệu đồng cho chiếc tai nghe này",
        factRefs: ["battery"],
      }),
      "body-1",
    );
    const snapshot = { ...goldenSnapshot(), priceVnd: 29_990_000 };
    const violations = checkScriptAgainstSnapshot(script, snapshot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      sceneId: "body-1",
      field: "voiceText",
      reason: "UNKNOWN_NUMERIC",
    });
  });

  it("flags an invented inputs.figure with no backing fact", () => {
    const script = isolateScene(
      mutateScene(validScript(), "body-1", {
        voiceText: "pin khỏe dùng lâu cho ngày dài làm việc",
        inputs: {
          kicker: "OneVoice",
          figure: "16",
          headline: ["Pin khỏe", "dùng lâu", "cả ngày"],
          standfirst: "Sạc nhanh USB-C tiện lợi.",
          footer_left: "OneVoice",
          footer_right: "onevoice.local",
        },
        factRefs: ["battery"],
      }),
      "body-1",
    );
    const snapshot: ProductSnapshot = {
      ...goldenSnapshot(),
      facts: [{ ref: "battery", label: "Pin", value: "Sạc nhanh USB-C", critical: true }],
    };
    const violations = checkScriptAgainstSnapshot(script, snapshot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      sceneId: "body-1",
      field: "inputs.figure",
      reason: "UNKNOWN_NUMERIC",
    });
  });

  it("flags invented RAM as UNKNOWN_SPEC", () => {
    const snapshot: ProductSnapshot = {
      ...goldenSnapshot(),
      facts: [{ ref: "ram", label: "RAM", value: "RAM 16 GB", critical: true }],
    };
    const script = isolateScene(
      mutateScene(validScript(), "body-1", {
        voiceText: "ba mươi hai gi-ga bờ ram cho mọi tác vụ nặng",
        inputs: {
          kicker: "OneVoice",
          figure: "16",
          headline: ["RAM lớn", "mười sáu GB", "mượt mà"],
          standfirst: "Đa nhiệm mượt mà mỗi ngày.",
          footer_left: "OneVoice",
          footer_right: "onevoice.local",
        },
        factRefs: ["ram"],
      }),
      "body-1",
    );
    const violations = checkScriptAgainstSnapshot(script, snapshot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ sceneId: "body-1", reason: "UNKNOWN_SPEC" });
  });

  it("flags a correctly-valued claim missing its factRef", () => {
    const script = isolateScene(mutateScene(validScript(), "body-1", { factRefs: [] }), "body-1");
    const violations = checkScriptAgainstSnapshot(script, validScriptTestSnapshot());
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.reason === "UNREFERENCED_FACT")).toBe(true);
  });

  it("must-not-false-positive: golden fixture paired with its real snapshot", () => {
    expect(checkScriptAgainstSnapshot(validScript(), goldenSnapshot())).toEqual([]);
  });

  it("accepts the price in all four renderings", () => {
    const price = 29_990_000;
    const base = validScript();
    const snapshot = goldenSnapshot();
    for (const rendering of [
      "29990000",
      "29.990.000",
      "29 triệu 990 nghìn",
      formatVietnameseNumber(price),
    ]) {
      const script = isolateScene(
        mutateScene(base, "outro-1", {
          voiceText: `giá chỉ ${rendering} đồng cho ưu đãi hôm nay nhé`,
          factRefs: [],
        }),
        "outro-1",
      );
      expect(checkScriptAgainstSnapshot(script, snapshot), rendering).toEqual([]);
    }
  });

  it("ignores scene counts, ordinals, dates, and durations", () => {
    const cases = [
      "ba lý do bạn nên chọn tai nghe chống ồn này",
      "đứng thứ ba trong bảng xếp hạng tai nghe",
      "khuyến mãi tới ngày 12/09/2026 cho mọi đơn hàng",
      "video dài bốn mươi giây với ba cảnh quay đẹp",
    ];
    const script = validScript();
    const snapshot = goldenSnapshot();
    for (const voiceText of cases) {
      const patched = isolateScene(
        mutateScene(script, "outro-1", { voiceText, factRefs: [] }),
        "outro-1",
      );
      expect(checkScriptAgainstSnapshot(patched, snapshot), voiceText).toEqual([]);
    }
  });

  it("accepts identity numbers from name/sku without factRefs", () => {
    const snapshot: ProductSnapshot = {
      ...goldenSnapshot(),
      name: "iPhone 16 Pro Max",
      sku: "IP16",
    };
    const script = isolateScene(
      mutateScene(validScript(), "hook-1", {
        voiceText: "iPhone 16 Pro Max mới về hàng",
        inputs: { headline: "iPhone 16" },
        factRefs: [],
      }),
      "hook-1",
    );
    expect(checkScriptAgainstSnapshot(script, snapshot)).toEqual([]);
  });

  it("catches a wrong digit price against the snapshot", () => {
    const script = isolateScene(
      mutateScene(validScript(), "outro-1", {
        voiceText: "giá chỉ 25.990.000 đồng cho ưu đãi hôm nay nhé",
        factRefs: [],
      }),
      "outro-1",
    );
    const violations = checkScriptAgainstSnapshot(script, goldenSnapshot());
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("UNKNOWN_NUMERIC");
  });
});

// The body-1 scene restates battery facts ("bốn mươi giờ", "mười phút")
// and references them — used by the UNREFERENCED_FACT case.
function validScriptTestSnapshot(): ProductSnapshot {
  return goldenSnapshot();
}
