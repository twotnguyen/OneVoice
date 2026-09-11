// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MUSIC_NAMES, SFX_NAMES } from "./audio-registry";
import {
  ProductScriptSchema,
  scriptSha256,
  type ProductScript,
} from "./script-schema";

// contentSchema lives in local-video-library.ts:47-53. T2 meta must mirror it.
const libSource = readFileSync(
  path.resolve(__dirname, "local-video-library.ts"),
  "utf8",
);

function validScript(): ProductScript {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, "__fixtures__/script-valid.json"), "utf8"),
  ) as ProductScript;
}

function withScenes(patches: Array<Record<string, unknown> | null>) {
  const base = validScript();
  const scenes = base.scenes.map((s, i) =>
    patches[i] ? { ...s, ...patches[i] } : { ...s },
  );
  return { ...base, scenes };
}

describe("script-schema", () => {
  it("accepts the golden fixture and hashes stably across key reordering", () => {
    const a = validScript();
    expect(ProductScriptSchema.safeParse(a).success).toBe(true);
    const reversed = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as unknown as ProductScript;
    expect(scriptSha256(reversed)).toBe(scriptSha256(a));
    expect(scriptSha256(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects unknown templateId, music, and sfx name", () => {
    const base = validScript();
    expect(
      ProductScriptSchema.safeParse(withScenes([{ templateId: "frame-does-not-exist" }]))
        .success,
    ).toBe(false);
    expect(
      ProductScriptSchema.safeParse({ ...base, music: "epic-trailer-9" }).success,
    ).toBe(false);
    expect(
      ProductScriptSchema.safeParse(
        withScenes([{ sfx: { name: "nope", volume: 0.4, startOffsetSec: 0 } }]),
      ).success,
    ).toBe(false);
    expect(MUSIC_NAMES).toContain(base.music);
    expect(SFX_NAMES).toContain(
      (base.scenes[0] as { sfx: { name: string } }).sfx.name,
    );
  });

  it("enforces total duration within 15000-25000", () => {
    // 26000: 9000 + 7000 + 5000 + 5000.
    expect(
      ProductScriptSchema.safeParse(
        withScenes([{ durationMs: 9000 }, { durationMs: 7000 }]),
      ).success,
    ).toBe(false);
    // 20000 baseline passes.
    expect(ProductScriptSchema.safeParse(validScript()).success).toBe(true);
    // 14000: three scenes at 5000/5000/4000 (also trips per-scene floor).
    const base = validScript();
    const under = {
      ...base,
      scenes: [
        { ...base.scenes[0], durationMs: 5000 },
        { ...base.scenes[1], durationMs: 5000 },
        { ...base.scenes[3], id: "outro-2", durationMs: 4000 },
      ],
    };
    expect(ProductScriptSchema.safeParse(under).success).toBe(false);
  });

  it("rejects durationMs below template natural duration", () => {
    expect(
      ProductScriptSchema.safeParse(withScenes([{ durationMs: 4000 }])).success,
    ).toBe(false);
  });

  it("rejects an outro with under 2000ms of hold after narration", () => {
    const outro = { voiceText: "x".repeat(300) }; // ~21s narration in a 5s scene
    expect(ProductScriptSchema.safeParse(withScenes([null, null, null, outro])).success).toBe(
      false,
    );
  });

  it("enforces scene count 3-5, hook first, outro last, unique ids", () => {
    const base = validScript();
    expect(
      ProductScriptSchema.safeParse({ ...base, scenes: base.scenes.slice(0, 2) }).success,
    ).toBe(false);
    const six = {
      ...base,
      scenes: [...base.scenes, { ...base.scenes[1], id: "extra-1" }],
    };
    expect(ProductScriptSchema.safeParse(six).success).toBe(false);
    expect(
      ProductScriptSchema.safeParse(withScenes([null, null, null, { type: "body" }]))
        .success,
    ).toBe(false);
    expect(
      ProductScriptSchema.safeParse(withScenes([{ type: "body" }])).success,
    ).toBe(false);
    expect(
      ProductScriptSchema.safeParse(withScenes([null, { id: "hook-1" }])).success,
    ).toBe(false);
  });

  it("rejects over-limit and unknown inputs slots", () => {
    expect(
      ProductScriptSchema.safeParse(
        withScenes([
          null,
          {
            inputs: {
              headline: ["dòng một quá dài ở đây", "dòng hai", "dòng ba", "dòng bốn"],
            },
          },
        ]),
      ).success,
    ).toBe(false);
    expect(
      ProductScriptSchema.safeParse(withScenes([{ inputs: { no_such_slot: "x" } }]))
        .success,
    ).toBe(false);
  });

  it("rejects meta.hook over 90 chars", () => {
    const base = validScript();
    expect(
      ProductScriptSchema.safeParse({
        ...base,
        meta: { ...base.meta, hook: "h".repeat(91) },
      }).success,
    ).toBe(false);
  });

  it("meta bounds mirror contentSchema bounds", () => {
    const bounds: Record<string, [number, number]> = {
      hook: [8, 90],
      caption: [20, 280],
      cta: [3, 60],
    };
    for (const [field, [min, max]] of Object.entries(bounds)) {
      expect(libSource).toContain(`${field}: z.string().min(${min}).max(${max})`);
    }
    const base = validScript();
    for (const [field, [min, max]] of Object.entries(bounds)) {
      const tooShort = { ...base, meta: { ...base.meta, [field]: "x".repeat(min - 1) } };
      const tooLong = { ...base, meta: { ...base.meta, [field]: "x".repeat(max + 1) } };
      expect(ProductScriptSchema.safeParse(tooShort).success).toBe(false);
      expect(ProductScriptSchema.safeParse(tooLong).success).toBe(false);
    }
  });
});
