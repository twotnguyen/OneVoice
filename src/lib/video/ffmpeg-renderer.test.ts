// SPDX-License-Identifier: Apache-2.0

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductSnapshot } from "../catalog/types";
import type { GeneratedProductContent } from "../content/types";
import {
  buildSceneEnableExpression,
  buildImageOverlayEnableExpression,
  FfmpegVideoRenderer,
  probeVideo,
} from "./ffmpeg-renderer";
import { compileProductStoryboard } from "./storyboard";

const roots: string[] = [];

async function captureProcess(executable: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false });
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(output));
      else reject(new Error(`${executable} exited with ${code}`));
    });
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FfmpegVideoRenderer", () => {
  it("uses disjoint scene windows at the four- and eight-second boundaries", () => {
    expect(buildSceneEnableExpression(0)).toBe("gte(t,0)*lt(t,4)");
    expect(buildSceneEnableExpression(1)).toBe("gte(t,4)*lt(t,8)");
    expect(buildSceneEnableExpression(2)).toBe("gte(t,8)*lte(t,12)");
    expect(buildImageOverlayEnableExpression()).toBe("gte(t,4)*lt(t,8)");
  });

  it("enables the facts image at second four and disables it at second eight in real FFmpeg", async () => {
    const expression = buildImageOverlayEnableExpression();
    const frames = await captureProcess("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=2x2:r=1:d=10",
      "-f",
      "lavfi",
      "-i",
      "color=white:s=2x2:r=1:d=10",
      "-filter_complex",
      `[0:v][1:v]overlay=enable='${expression}',format=gray`,
      "-frames:v",
      "10",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    const firstPixel = (second: number) => frames[second * 4];

    expect(firstPixel(3)).toBeLessThan(128);
    expect(firstPixel(4)).toBeGreaterThan(128);
    expect(firstPixel(7)).toBeGreaterThan(128);
    expect(firstPixel(8)).toBeLessThan(128);
  });

  it(
    "does not return success for an absent, wrong-sized, wrong-codec, wrong-pixel-format, or unplayable file",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "onevoice-render-test-"));
      roots.push(root);
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
        facts: [],
      };
      const content: GeneratedProductContent = {
        hook: "Sẵn sàng cho mọi trận đấu.",
        caption: "Hiệu năng mạnh trong một thiết kế gọn gàng.",
        cta: "Xem thông tin sản phẩm",
        model: "muse-test",
      };
      const renderer = new FfmpegVideoRenderer({ outputRoot: root });

      const video = await renderer.render({
        storyboard: compileProductStoryboard(snapshot, content),
      });
      const probe = await probeVideo(video.path);

      expect(probe).toMatchObject({
        formatName: expect.stringContaining("mp4"),
        codecName: "h264",
        pixelFormat: "yuv420p",
        width: 1080,
        height: 1920,
      });
      expect(probe.durationMs).toBeGreaterThanOrEqual(11_500);
      expect(probe.durationMs).toBeLessThanOrEqual(12_500);
      expect(video).toMatchObject({
        ...probe,
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        rendererRevision: "onevoice-ffmpeg-v1",
      });
      expect((await stat(video.path)).size).toBe(video.bytes);

      const mp4 = await readFile(video.path);
      expect(mp4.indexOf(Buffer.from("moov"))).toBeGreaterThan(0);
      expect(mp4.indexOf(Buffer.from("moov"))).toBeLessThan(mp4.indexOf(Buffer.from("mdat")));
      expect(await readdir(root)).toEqual([path.basename(video.path)]);

      await video.cleanup();
      await expect(readdir(root)).resolves.toEqual([]);
    },
    60_000,
  );

  it(
    "renders when output and configured font paths contain filter metacharacters",
    async () => {
      const parent = await mkdtemp(path.join(tmpdir(), "onevoice-render-path-test-"));
      roots.push(parent);
      const root = path.join(parent, "media'colon:\\,brackets[];root");
      const candidates = [
        process.env.ONEVOICE_FONT_PATH,
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      ].filter((candidate): candidate is string => Boolean(candidate));
      let sourceFont: string | undefined;
      for (const candidate of candidates) {
        try {
          if ((await stat(candidate)).isFile()) sourceFont = candidate;
        } catch {
          // Try the next supported platform font.
        }
        if (sourceFont) break;
      }
      expect(sourceFont).toBeDefined();
      await mkdir(root, { recursive: true });
      const unusualFontPath = path.join(root, "font'colon:\\,brackets[];.ttf");
      await copyFile(sourceFont!, unusualFontPath);
      const renderer = new FfmpegVideoRenderer({ outputRoot: root, fontPath: unusualFontPath });
      const video = await renderer.render({
        storyboard: {
          schema: "onevoice.storyboard.v1",
          template: "product-spotlight-v1",
          canvas: { width: 1080, height: 1920, fps: 30, durationMs: 12_000 },
          scenes: [
            { kind: "hook", durationMs: 4_000, lines: ["Hook scene"] },
            { kind: "facts", durationMs: 4_000, lines: ["Facts scene"] },
            { kind: "cta", durationMs: 4_000, lines: ["CTA scene"] },
          ],
        },
      });

      await expect(probeVideo(video.path)).resolves.toMatchObject({
        codecName: "h264",
        width: 1080,
        height: 1920,
      });
      await video.cleanup();
    },
    60_000,
  );
});
