// SPDX-License-Identifier: Apache-2.0
// Unit suite for TemplateVideoRenderer with compose/TTS/ffmpeg injected as
// fakes (mirrors product-video-pipeline.test.ts). The A3 guarantee — fit
// targets come from scene.durationMs, never measured TTS — is asserted
// directly. Byte-determinism proof is T12's e2e gate, not this file.

import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ComposeArgs } from "./template-pipeline/compose-template";
import type { probeVideo } from "./ffmpeg-renderer";
import type { ProductScript } from "./script-schema";
import { TemplateVideoRenderer } from "./template-video-renderer";

function validScript(): ProductScript {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, "__fixtures__/script-valid.json"), "utf8"),
  ) as ProductScript;
}

type FitCall = { targetSec: number };
type ComposeCall = { templateId: string; inputs: Record<string, unknown> };

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function rendererHarness(options: {
  script?: ProductScript;
  measuredSec?: number;
  probeOverride?: Record<string, unknown>;
  naturalMs?: (templateId: string) => number;
} = {}) {
  const script = options.script ?? validScript();
  const outputRoot = mkdtempSync(path.join(tmpdir(), "onevoice-template-test-"));
  roots.push(outputRoot);
  const composeCalls: ComposeCall[] = [];
  const fitCalls: FitCall[] = [];
  const calls = { mixMusic: 0, concatVideos: 0, mux: 0, compose: 0 };
  let tick = 0;
  const totalMs = script.scenes.reduce((sum, s) => sum + s.durationMs, 0);

  const renderer = new TemplateVideoRenderer({
    outputRoot,
    templatesRoot: "/templates",
    audioRoot: "/audio",
    hyperframesPath: "hyperframes",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    tts: {
      async synthesize(_text: string, outPath: string): Promise<void> {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(outPath, "fake-mp3");
      },
    },
    musicGain: 0.35,
    clock: () => (tick += 10),
    compose: async (args: ComposeArgs) => {
      calls.compose += 1;
      composeCalls.push({ templateId: args.templateId, inputs: args.inputs });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(args.outputPath, "fake-clip");
      return args.outputPath;
    },
    fitClip: async (_in: string, targetSec: number, outPath: string) => {
      fitCalls.push({ targetSec });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, "fake-fitted");
    },
    concatVideos: async (clipPaths: string[], outPath: string) => {
      calls.concatVideos += 1;
      expect(clipPaths).toHaveLength(script.scenes.length);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, "fake-silent");
    },
    mux: async (_video: string, _audio: string, outPath: string) => {
      calls.mux += 1;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, "fake-final");
    },
    probe: (async () => ({
      formatName: "mp4",
      codecName: "h264",
      pixelFormat: "yuv420p",
      width: 1080,
      height: 1920,
      durationMs: totalMs,
      ...(options.probeOverride ?? {}),
    })) as typeof probeVideo,
    measureAudio: async () => options.measuredSec ?? 2.0,
    padAudio: async () => undefined,
    concatAudio: async () => undefined,
    mixSfx: async () => undefined,
    mixMusic: async () => {
      calls.mixMusic += 1;
    },
    resolveMusic: (name: string) => `/audio/${name}.mp3`,
    resolveSfx: (name: string) => `/audio/${name}.mp3`,
    ...(options.naturalMs ? { naturalMs: options.naturalMs } : {}),
  });

  return { renderer, script, composeCalls, fitCalls, calls, totalMs };
}

describe("TemplateVideoRenderer", () => {
  it("derives fit targets from scene.durationMs, not measured TTS durations", async () => {
    const test = rendererHarness({ measuredSec: 2.0 });
    const scenes: string[] = [];
    const video = await test.renderer.render({
      script: test.script,
      onSceneProgress: (index, total) => {
        scenes.push(`${index}/${total}`);
      },
    });

    expect(test.composeCalls).toHaveLength(4);
    expect(test.composeCalls.map((c) => c.templateId)).toEqual(
      test.script.scenes.map((s) => s.templateId),
    );
    expect(test.composeCalls[0]?.inputs).toEqual(test.script.scenes[0]?.inputs);
    expect(test.fitCalls).toHaveLength(4);
    for (const [i, call] of test.fitCalls.entries()) {
      expect(call.targetSec).toBe((test.script.scenes[i]?.durationMs ?? 0) / 1000);
    }
    expect([...scenes].sort()).toEqual(["0/4", "1/4", "2/4", "3/4"]);
    expect(video.rendererRevision).toBe("onevoice-template-v1");
    expect(video.durationMs).toBe(test.totalMs);
    expect(typeof video.cleanup).toBe("function");
    await video.cleanup();
  });

  it("rejects NARRATION_OVERRUNS_SCENE when measured TTS exceeds durationMs", async () => {
    const test = rendererHarness({ measuredSec: 7.0 });
    await expect(test.renderer.render({ script: test.script })).rejects.toThrow(
      "NARRATION_OVERRUNS_SCENE",
    );
  });

  it("rejects a scene below its template natural duration before any ffmpeg call", async () => {
    const script = validScript();
    const test = rendererHarness({ script, naturalMs: () => 6_000 });
    await expect(test.renderer.render({ script })).rejects.toThrow(
      "SCENE_BELOW_NATURAL_DURATION",
    );
    expect(test.calls.compose).toBe(0);
  });

  it("mixes music exactly once when set, never when null", async () => {
    const withMusic = rendererHarness();
    const noMusicScript = { ...validScript(), music: null } as ProductScript;
    const withoutMusic = rendererHarness({ script: noMusicScript });

    const withVideo = await withMusic.renderer.render({ script: withMusic.script });
    await withVideo.cleanup();
    expect(withMusic.calls.mixMusic).toBe(1);

    const withoutVideo = await withoutMusic.renderer.render({ script: noMusicScript });
    await withoutVideo.cleanup();
    expect(withoutMusic.calls.mixMusic).toBe(0);
  });

  it("rejects a landscape probe", async () => {
    const test = rendererHarness({ probeOverride: { width: 1920, height: 1080 } });
    await expect(test.renderer.render({ script: test.script })).rejects.toThrow(
      "Rendered video failed verification",
    );
  });

  it("emits all four sub-render timing keys with positive values", async () => {
    const test = rendererHarness();
    const video = await test.renderer.render({ script: test.script });
    await video.cleanup();
    expect(video.timings).toMatchObject({
      synthesizing_voice_ms: expect.any(Number),
      composing_scenes_ms: expect.any(Number),
      mixing_audio_ms: expect.any(Number),
      muxing_ms: expect.any(Number),
    });
    for (const value of Object.values(video.timings ?? {})) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it("rejects an invalid script and a truth-violating script", async () => {
    const test = rendererHarness();
    const bad = { ...validScript(), scenes: [] } as unknown as ProductScript;
    await expect(test.renderer.render({ script: bad })).rejects.toThrow(
      "TEMPLATE_SCRIPT_INVALID",
    );
    const lying = {
      ...validScript(),
      scenes: validScript().scenes.map((s) => ({
        ...s,
        voiceText: "Giá chỉ một đồng Việt Nam",
        factRefs: [],
      })),
    } as ProductScript;
    await expect(
      test.renderer.render({
        script: lying,
        snapshot: {
          productId: "p",
          organizationId: "a0000000-0000-0000-0000-000000000001",
          name: "Tai nghe",
          sku: "TN-1",
          brand: "OneVoice",
          priceVnd: 29_990_000,
          currency: "VND",
          stockQuantity: 1,
          collectedAt: "2026-09-09T00:00:00.000Z",
          primaryImageUrl: null,
          facts: [],
        },
      }),
    ).rejects.toThrow("SCRIPT_TRUTH_VIOLATION");
  });
});
