// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductSnapshot } from "../catalog/types";
import type { GeneratedProductContent } from "../content/types";
import { FfmpegVideoRenderer, probeVideo } from "./ffmpeg-renderer";
import { compileProductStoryboard } from "./storyboard";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FfmpegVideoRenderer", () => {
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
});
