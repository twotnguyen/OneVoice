// SPDX-License-Identifier: Apache-2.0
// Deterministic template renderer (T7). The video track is a pure function of
// script.json: each scene composes its template slot-fill then fits to
// scene.durationMs, which T2 guarantees >= the template natural duration — so
// fitClipToDuration is always in its padding branch, asserted here with a hard
// error (R-K defence in depth). Narration is synthesized per scene, measured,
// and rejected with NARRATION_OVERRUNS_SCENE if it exceeds durationMs (A7),
// then silence-padded to exactly durationMs. Real ffmpeg work is injected as
// fakes in the unit suite; byte-determinism proof lives in T12's e2e gate.

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";

import pLimit from "p-limit";

import type { TtsClient } from "@/lib/tts/vieneu-client";
import { checkScriptAgainstSnapshot } from "@/lib/content/truth-guard";
import type { ProductSnapshot } from "@/lib/catalog/types";
import {
  ProductScriptSchema,
  type ProductScript,
} from "./script-schema";
import { TEMPLATE_REGISTRY } from "./template-registry";
import { resolveMusicPath, resolveSfxPath } from "./audio-registry";
import { composeTemplate, type ComposeArgs } from "./template-pipeline/compose-template";
import {
  concatVideos,
  fitClipToDuration,
  muxAudioOntoVideo,
} from "./template-pipeline/video-tools";
import {
  concatAudio,
  getDurationSec,
  mixMusicBed,
  mixSfxOntoVoice,
  padAudioToDuration,
} from "./template-pipeline/audio-tools";
import { probeVideo } from "./ffmpeg-renderer";
import type { RenderedVideo } from "./types";

export const TEMPLATE_RENDERER_REVISION = "onevoice-template-v1" as const;
const MUSIC_FADE_SEC = 1.5;
const PROBE_TOLERANCE_MS = 250;
const COMPOSE_TIMEOUT_MS = 120_000;

export type TemplateRenderRequest = Readonly<{
  script: ProductScript;
  snapshot?: ProductSnapshot;
  imagePath?: string;
  onSceneProgress?: (sceneIndex: number, total: number) => void;
  onStage?: (stage: "synthesizing_voice" | "composing_scenes") => void;
}>;

type RendererDeps = Readonly<{
  compose?: (args: ComposeArgs) => Promise<string>;
  fitClip?: (inPath: string, targetSec: number, outPath: string, fps: number) => Promise<void>;
  concatVideos?: (clipPaths: string[], outPath: string) => Promise<void>;
  mux?: (videoPath: string, audioPath: string, outPath: string) => Promise<void>;
  probe?: typeof probeVideo;
  measureAudio?: typeof getDurationSec;
  padAudio?: typeof padAudioToDuration;
  concatAudio?: typeof concatAudio;
  mixSfx?: typeof mixSfxOntoVoice;
  mixMusic?: typeof mixMusicBed;
  resolveMusic?: typeof resolveMusicPath;
  resolveSfx?: typeof resolveSfxPath;
  naturalMs?: (templateId: string) => number;
  clock?: () => number;
}>;

export type TemplateVideoRendererOptions = Readonly<{
  outputRoot: string;
  templatesRoot: string;
  audioRoot: string;
  hyperframesPath: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  tts: Pick<TtsClient, "synthesize">;
  musicGain: number;
  fps?: number;
  composeTimeoutMs?: number;
}> &
  RendererDeps;

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

export class TemplateVideoRenderer {
  private readonly options: TemplateVideoRendererOptions;
  private readonly compose: (args: ComposeArgs) => Promise<string>;
  private readonly fitClip: NonNullable<RendererDeps["fitClip"]>;
  private readonly concat: NonNullable<RendererDeps["concatVideos"]>;
  private readonly mux: NonNullable<RendererDeps["mux"]>;
  private readonly probe: typeof probeVideo;
  private readonly measureAudio: typeof getDurationSec;
  private readonly padAudio: typeof padAudioToDuration;
  private readonly concatAudio: typeof concatAudio;
  private readonly mixSfx: typeof mixSfxOntoVoice;
  private readonly mixMusic: typeof mixMusicBed;
  private readonly resolveMusic: typeof resolveMusicPath;
  private readonly resolveSfx: typeof resolveSfxPath;
  private readonly naturalMs: (templateId: string) => number;
  private readonly clock: () => number;

  constructor(options: TemplateVideoRendererOptions) {
    this.options = options;
    this.compose = options.compose ?? composeTemplate;
    this.fitClip = options.fitClip ?? fitClipToDuration;
    this.concat = options.concatVideos ?? concatVideos;
    this.mux = options.mux ?? muxAudioOntoVideo;
    this.probe = options.probe ?? probeVideo;
    this.measureAudio = options.measureAudio ?? getDurationSec;
    this.padAudio = options.padAudio ?? padAudioToDuration;
    this.concatAudio = options.concatAudio ?? concatAudio;
    this.mixSfx = options.mixSfx ?? mixSfxOntoVoice;
    this.mixMusic = options.mixMusic ?? mixMusicBed;
    this.resolveMusic = options.resolveMusic ?? resolveMusicPath;
    this.resolveSfx = options.resolveSfx ?? resolveSfxPath;
    this.naturalMs =
      options.naturalMs ??
      ((templateId: string) =>
        TEMPLATE_REGISTRY[templateId as keyof typeof TEMPLATE_REGISTRY].naturalDurationMs);
    this.clock = options.clock ?? performance.now.bind(performance);
  }

  async render(request: TemplateRenderRequest): Promise<RenderedVideo> {
    const timings: Record<string, number> = {};
    const parsed = ProductScriptSchema.safeParse(request.script);
    if (!parsed.success) throw new Error("TEMPLATE_SCRIPT_INVALID");
    const script = parsed.data;
    if (request.snapshot) {
      const violations = checkScriptAgainstSnapshot(script, request.snapshot);
      if (violations.length > 0) throw new Error("SCRIPT_TRUTH_VIOLATION");
    }
    for (const scene of script.scenes) {
      if (scene.durationMs < this.naturalMs(scene.templateId)) {
        throw new Error("SCENE_BELOW_NATURAL_DURATION");
      }
    }

    const outputRoot = path.resolve(this.options.outputRoot);
    await mkdir(outputRoot, { recursive: true, mode: 0o700 });
    const workDirectory = await mkdtemp(path.join(outputRoot, ".work-"));
    const outputPath = path.join(outputRoot, `${randomUUID()}.mp4`);
    const fps = this.options.fps ?? 30;
    const totalMs = script.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);

    try {
      // Video track: compose + fit per scene, in parallel (bounded). Pure
      // function of the script — measured TTS durations never feed back here.
      request.onStage?.("composing_scenes");
      const composeLimit = pLimit(2);
      let t0 = this.clock();
      const clipPaths = await Promise.all(
        script.scenes.map((scene, index) =>
          composeLimit(async () => {
            const rawPath = path.join(workDirectory, `scene-${index}-raw.mp4`);
            await this.compose({
              templatesRoot: this.options.templatesRoot,
              templateId: scene.templateId,
              inputs: scene.inputs as Record<string, unknown>,
              outputPath: rawPath,
              aspect: script.aspect,
              fps,
              hyperframesPath: this.options.hyperframesPath,
              timeoutMs: this.options.composeTimeoutMs ?? COMPOSE_TIMEOUT_MS,
            });
            const fittedPath = path.join(workDirectory, `scene-${index}.mp4`);
            await this.fitClip(rawPath, scene.durationMs / 1000, fittedPath, fps);
            request.onSceneProgress?.(index, script.scenes.length);
            return fittedPath;
          }),
        ),
      );
      const silentPath = path.join(workDirectory, "silent.mp4");
      await this.concat(clipPaths, silentPath);
      timings.composing_scenes_ms = Math.round(this.clock() - t0);

      // Audio track: per-scene TTS serialized (the sidecar serializes anyway),
      // measured, overrun-gated, then silence-padded to exactly durationMs.
      request.onStage?.("synthesizing_voice");
      t0 = this.clock();
      const ttsLimit = pLimit(1);
      const sfxSpecs: Array<{ path: string; startSec: number; volume: number }> = [];
      const paddedPaths = await Promise.all(
        script.scenes.map((scene, index) =>
          ttsLimit(async () => {
            const rawAudio = path.join(workDirectory, `scene-${index}-raw.mp3`);
            await this.options.tts.synthesize(scene.voiceText, rawAudio);
            const measuredSec = await this.measureAudio(rawAudio);
            if (measuredSec * 1000 > scene.durationMs) {
              throw new Error("NARRATION_OVERRUNS_SCENE");
            }
            const padded = path.join(workDirectory, `scene-${index}.mp3`);
            await this.padAudio(rawAudio, scene.durationMs / 1000, padded);
            if (scene.sfx) {
              const offsetSec =
                script.scenes.slice(0, index).reduce((sum, s) => sum + s.durationMs, 0) / 1000 +
                scene.sfx.startOffsetSec;
              sfxSpecs.push({
                path: this.resolveSfx(scene.sfx.name, this.options.audioRoot),
                startSec: offsetSec,
                volume: scene.sfx.volume,
              });
            }
            return padded;
          }),
        ),
      );
      const voicePath = path.join(workDirectory, "voice.mp3");
      await this.concatAudio(paddedPaths, voicePath);
      timings.synthesizing_voice_ms = Math.round(this.clock() - t0);

      // Mix: SFX at scene offsets, then the looped+faded music bed.
      t0 = this.clock();
      const sfxPath = path.join(workDirectory, "voice-sfx.mp3");
      await this.mixSfx(voicePath, sfxSpecs, sfxPath);
      let finalAudio = sfxPath;
      if (script.music !== null) {
        const mixedPath = path.join(workDirectory, "final.mp3");
        await this.mixMusic(
          sfxPath,
          this.resolveMusic(script.music, this.options.audioRoot),
          this.options.musicGain,
          totalMs / 1000,
          mixedPath,
        );
        finalAudio = mixedPath;
      }
      timings.mixing_audio_ms = Math.round(this.clock() - t0);

      // Mux + probe gate: 1080x1920 h264/yuv420p, duration within ±250 ms.
      t0 = this.clock();
      await this.mux(silentPath, finalAudio, outputPath);
      timings.muxing_ms = Math.round(this.clock() - t0);
      const probe = await this.probe(outputPath, this.options.ffprobePath ?? "ffprobe");
      if (
        !probe.formatName.includes("mp4") ||
        probe.codecName !== "h264" ||
        probe.pixelFormat !== "yuv420p" ||
        probe.width !== 1080 ||
        probe.height !== 1920 ||
        Math.abs(probe.durationMs - totalMs) > PROBE_TOLERANCE_MS
      ) {
        throw new Error("Rendered video failed verification");
      }

      const details = await stat(outputPath);
      const sha256 = await sha256File(outputPath);
      return {
        path: outputPath,
        bytes: details.size,
        sha256,
        ...probe,
        rendererRevision: TEMPLATE_RENDERER_REVISION,
        timings,
        cleanup: () => rm(outputPath, { force: true }),
      };
    } catch (error) {
      await rm(outputPath, { force: true });
      throw error;
    } finally {
      // A rejected scene task leaves sibling tasks still writing into
      // workDirectory; a single rm can hit ENOTEMPTY and mask the real error.
      try {
        await rm(workDirectory, { recursive: true, force: true });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await rm(workDirectory, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

export { MUSIC_FADE_SEC };
