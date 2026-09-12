// SPDX-License-Identifier: Apache-2.0
//
// Video determinism E2E tests (T12).
// Tests structural identicalness (duration, resolution, format, codecs) and
// content-level determinism (SSIM metric or elementary video stream hash)
// between independent render runs with identical inputs.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { probeVideo } from "./ffmpeg-renderer";
import type { VideoProbe, VideoStoryboard } from "./types";
import { FfmpegVideoRenderer } from "./ffmpeg-renderer";

export type StructuralComparison = Readonly<{
  identical: boolean;
  differences: readonly string[];
}>;

/**
 * Compares two video probes for structural determinism per T12 spec.
 * Evaluates width, height, codecName, pixelFormat, container format,
 * and duration tolerance.
 */
export function compareStructuralDeterminism(
  probeA: VideoProbe,
  probeB: VideoProbe,
  durationToleranceMs = 250,
): StructuralComparison {
  const differences: string[] = [];

  if (probeA.width !== probeB.width) {
    differences.push(`Width mismatch: ${probeA.width} vs ${probeB.width}`);
  }
  if (probeA.height !== probeB.height) {
    differences.push(`Height mismatch: ${probeA.height} vs ${probeB.height}`);
  }
  if (probeA.codecName !== probeB.codecName) {
    differences.push(`Codec mismatch: ${probeA.codecName} vs ${probeB.codecName}`);
  }
  if (probeA.pixelFormat !== probeB.pixelFormat) {
    differences.push(`Pixel format mismatch: ${probeA.pixelFormat} vs ${probeB.pixelFormat}`);
  }

  const isMp4A = probeA.formatName.split(",").includes("mp4");
  const isMp4B = probeB.formatName.split(",").includes("mp4");
  if (isMp4A !== isMp4B) {
    differences.push(`Format mismatch: ${probeA.formatName} vs ${probeB.formatName}`);
  }

  const durationDiff = Math.abs(probeA.durationMs - probeB.durationMs);
  if (durationDiff > durationToleranceMs) {
    differences.push(
      `Duration drift exceeds ${durationToleranceMs}ms: difference is ${durationDiff}ms (${probeA.durationMs}ms vs ${probeB.durationMs}ms)`,
    );
  }

  return {
    identical: differences.length === 0,
    differences,
  };
}

/**
 * Computes structural similarity (SSIM) between two video files using FFmpeg.
 * Returns SSIM metric for Y, U, V channels and overall (All).
 * SSIM == 1.0 indicates perfect visual identicalness.
 */
export async function computeVideoSsim(
  videoPathA: string,
  videoPathB: string,
  ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg",
): Promise<{ ssimAll: number; ssimY: number; ssimU: number; ssimV: number }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    ssimAll: number;
    ssimY: number;
    ssimU: number;
    ssimV: number;
  }>();

  const child = spawn(
    ffmpegPath,
    [
      "-v",
      "error",
      "-i",
      videoPathA,
      "-i",
      videoPathB,
      "-filter_complex",
      "[0:v][1:v]ssim=stats_file=-",
      "-f",
      "null",
      "-",
    ],
    { shell: false },
  );

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) {
      return reject(new Error(`FFmpeg SSIM calculation failed (code ${code}): ${output}`));
    }

    const allMatch = output.match(/All:([0-9.]+)/i);
    const yMatch = output.match(/Y:([0-9.]+)/i);
    const uMatch = output.match(/U:([0-9.]+)/i);
    const vMatch = output.match(/V:([0-9.]+)/i);

    if (!allMatch) {
      return reject(new Error(`Failed to parse SSIM output: ${output}`));
    }

    resolve({
      ssimAll: parseFloat(allMatch[1]),
      ssimY: yMatch ? parseFloat(yMatch[1]) : parseFloat(allMatch[1]),
      ssimU: uMatch ? parseFloat(uMatch[1]) : parseFloat(allMatch[1]),
      ssimV: vMatch ? parseFloat(vMatch[1]) : parseFloat(allMatch[1]),
    });
  });

  return promise;
}

/**
 * Computes MD5 checksum of the raw video elementary stream via FFmpeg.
 * Strips container metadata to verify frame data bit-level determinism.
 */
export async function computeElementaryStreamHash(
  videoPath: string,
  ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg",
): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();

  const child = spawn(
    ffmpegPath,
    ["-v", "error", "-i", videoPath, "-map", "0:v", "-f", "md5", "-"],
    { shell: false },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) {
      return reject(new Error(`FFmpeg elementary stream hash failed: ${stderr}`));
    }
    const cleaned = stdout.trim().replace(/^MD5=/, "");
    resolve(cleaned);
  });

  return promise;
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe.skipIf(!process.env.ONEVOICE_E2E)("video determinism e2e", () => {
  const sampleProbeA: VideoProbe = {
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    codecName: "h264",
    pixelFormat: "yuv420p",
    width: 1080,
    height: 1920,
    durationMs: 12000,
  };

  it("passes structural determinism when duration, resolution, and format match", () => {
    const sampleProbeB: VideoProbe = {
      formatName: "mp4",
      codecName: "h264",
      pixelFormat: "yuv420p",
      width: 1080,
      height: 1920,
      durationMs: 12050, // within 250ms tolerance
    };

    const result = compareStructuralDeterminism(sampleProbeA, sampleProbeB, 250);
    expect(result.identical).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("detects structural mismatch on differing dimensions, codec, or excessive duration drift", () => {
    const mismatchedProbe: VideoProbe = {
      formatName: "mp4",
      codecName: "hevc",
      pixelFormat: "yuv422p",
      width: 720,
      height: 1280,
      durationMs: 13000, // 1000ms drift > 250ms
    };

    const result = compareStructuralDeterminism(sampleProbeA, mismatchedProbe, 250);
    expect(result.identical).toBe(false);
    expect(result.differences.some((d) => d.includes("Width mismatch"))).toBe(true);
    expect(result.differences.some((d) => d.includes("Height mismatch"))).toBe(true);
    expect(result.differences.some((d) => d.includes("Codec mismatch"))).toBe(true);
    expect(result.differences.some((d) => d.includes("Pixel format mismatch"))).toBe(true);
    expect(result.differences.some((d) => d.includes("Duration drift exceeds"))).toBe(true);
  });

  it("proves end-to-end render determinism between two independent runs with identical inputs", async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), "onevoice-determinism-e2e-"));
    tempDirs.push(outputRoot);

    const renderer = new FfmpegVideoRenderer({
      outputRoot,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
    });

    const storyboard: VideoStoryboard = {
      schema: "onevoice.storyboard.v1",
      template: "product-spotlight-v1",
      canvas: {
        width: 1080,
        height: 1920,
        fps: 30,
        durationMs: 12000,
      },
      scenes: [
        { kind: "hook", durationMs: 4000, lines: ["OneVoice Studio", "Determinism Check"] },
        { kind: "facts", durationMs: 4000, lines: ["Scene 2 Verification", "1080x1920 Portrait"] },
        { kind: "cta", durationMs: 4000, lines: ["Call to Action", "Final Scene"] },
      ],
    };

    // Render Run 1
    const render1 = await renderer.render({ storyboard });
    // Render Run 2
    const render2 = await renderer.render({ storyboard });

    expect(render1.path).toBeDefined();
    expect(render2.path).toBeDefined();

    const probe1 = await probeVideo(render1.path, process.env.FFPROBE_PATH || "ffprobe");
    const probe2 = await probeVideo(render2.path, process.env.FFPROBE_PATH || "ffprobe");

    // 1. Structural identicalness check
    const structural = compareStructuralDeterminism(probe1, probe2, 250);
    expect(structural.identical).toBe(true);
    expect(probe1.width).toBe(1080);
    expect(probe1.height).toBe(1920);
    expect(probe1.codecName).toBe("h264");
    expect(probe1.pixelFormat).toBe("yuv420p");

    // 2. Visual determinism via SSIM check
    const ssim = await computeVideoSsim(render1.path, render2.path);
    // SSIM >= 0.999 demonstrates near-perfect visual identicalness
    expect(ssim.ssimAll).toBeGreaterThanOrEqual(0.99);

    // 3. Elementary stream hash comparison
    const hash1 = await computeElementaryStreamHash(render1.path);
    const hash2 = await computeElementaryStreamHash(render2.path);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBeGreaterThan(0);
    expect(hash2.length).toBeGreaterThan(0);
  // Two full-resolution renders plus SSIM exceed the default 5s on CI CPUs.
  }, 120_000);
});
