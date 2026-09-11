// SPDX-License-Identifier: Apache-2.0

import { stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MUSIC,
  MUSIC_NAMES,
  SFX,
  SFX_NAMES,
  resolveMusicPath,
  resolveSfxPath,
} from "./audio-registry";

const ASSETS_ROOT = path.resolve(__dirname, "../../../assets/audio");

describe("audio-registry", () => {
  it("exposes non-empty unique allow-lists", () => {
    expect(MUSIC_NAMES.length).toBeGreaterThan(0);
    expect(SFX_NAMES.length).toBeGreaterThan(0);
    expect(new Set(MUSIC_NAMES).size).toBe(MUSIC_NAMES.length);
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length);
  });

  it("documents licence and source for every entry", () => {
    for (const entry of [...MUSIC, ...SFX]) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.file.trim().length).toBeGreaterThan(0);
      expect(entry.licence.trim().length).toBeGreaterThan(0);
      expect(entry.source.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves every name to a non-empty file on disk", async () => {
    for (const name of MUSIC_NAMES) {
      const resolved = resolveMusicPath(name, ASSETS_ROOT);
      expect((await stat(resolved)).size).toBeGreaterThan(0);
    }
    for (const name of SFX_NAMES) {
      const resolved = resolveSfxPath(name, ASSETS_ROOT);
      expect((await stat(resolved)).size).toBeGreaterThan(0);
    }
  });

  it("rejects traversal names and unknown names", () => {
    for (const traversal of ["../secret", "..\\secret", "sfx/../x", "/abs"]) {
      expect(() => resolveMusicPath(traversal, ASSETS_ROOT)).toThrow();
      expect(() => resolveSfxPath(traversal, ASSETS_ROOT)).toThrow();
    }
    expect(() => resolveMusicPath("no-such-track", ASSETS_ROOT)).toThrow("unknown music");
    expect(() => resolveSfxPath("no-such-sfx", ASSETS_ROOT)).toThrow("unknown sfx");
  });
});
