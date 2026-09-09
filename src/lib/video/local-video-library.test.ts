// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LocalVideoLibrary } from "./local-video-library";
import type { RenderedVideo, VideoManifest } from "./types";

const roots: string[] = [];
const renderId = "550e8400-e29b-41d4-a716-446655440000";

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-library-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("LocalVideoLibrary", () => {
  it.each(["../escape", "video", "550e8400-e29b-41d4-a716-446655440000/../../escape", ""])(
    "rejects non-UUID render ID %j",
    async (invalidId) => {
      const library = new LocalVideoLibrary(await temporaryRoot());
      await expect(library.getRun(invalidId)).rejects.toThrow("Invalid render ID");
      await expect(library.readVideo(invalidId)).rejects.toThrow("Invalid render ID");
    },
  );

  it("atomically places a safe manifest and video below the configured root", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "source.mp4");
    await writeFile(sourcePath, new Uint8Array([0, 1, 2, 3]));
    const library = new LocalVideoLibrary(path.join(root, "library"));
    const video: RenderedVideo = {
      path: sourcePath,
      bytes: 4,
      sha256: "abcd",
      durationMs: 12_000,
      width: 1080,
      height: 1920,
      codecName: "h264",
      pixelFormat: "yuv420p",
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      rendererRevision: "onevoice-ffmpeg-v1",
      cleanup: async () => undefined,
    };
    const manifest: VideoManifest = {
      renderId,
      status: "succeeded",
      content: { hook: "Hook", caption: "Caption", cta: "CTA" },
      artifact: {
        bytes: video.bytes,
        sha256: video.sha256,
        durationMs: video.durationMs,
        width: video.width,
        height: video.height,
        codecName: video.codecName,
        pixelFormat: video.pixelFormat,
        formatName: video.formatName,
        rendererRevision: video.rendererRevision,
      },
    };

    await library.save(renderId, manifest, video);

    const directory = path.join(root, "library", renderId);
    expect(await readdir(directory)).toEqual(["manifest.json", "video.mp4"]);
    await expect(readFile(path.join(directory, "video.mp4"))).resolves.toEqual(
      Buffer.from([0, 1, 2, 3]),
    );
    await expect(library.getRun(renderId)).resolves.toEqual(manifest);
    await expect(library.readVideo(renderId)).resolves.toEqual({
      path: path.join(directory, "video.mp4"),
      size: 4,
    });
    expect(await readFile(path.join(directory, "manifest.json"), "utf8")).not.toContain(sourcePath);
  });

  it("stores a failed safe manifest without creating a video", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const manifest: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "RENDER_FAILED", message: "Video render failed" },
    };

    await library.save(renderId, manifest);

    await expect(library.getRun(renderId)).resolves.toEqual(manifest);
    await expect(library.readVideo(renderId)).resolves.toBeNull();
    expect(await readdir(path.join(root, renderId))).toEqual(["manifest.json"]);
  });

  it("returns null for missing artifacts", async () => {
    const library = new LocalVideoLibrary(await temporaryRoot());
    await expect(library.getRun(renderId)).resolves.toBeNull();
    await expect(library.readVideo(renderId)).resolves.toBeNull();
  });

  it("rejects a manifest whose render ID differs from its directory", async () => {
    const library = new LocalVideoLibrary(await temporaryRoot());
    await expect(
      library.save(renderId, {
        renderId: "d9428888-122b-11e1-b85c-61cd3cbb3210",
        status: "failed",
      }),
    ).rejects.toThrow("Manifest render ID does not match");
  });

  it("omits extra runtime fields so internal paths cannot enter manifests", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const manifest = {
      renderId,
      status: "failed" as const,
      error: {
        stage: "rendering_video",
        code: "RENDER_FAILED",
        message: "Video render failed",
        internalPath: "/private/render/work.mp4",
      },
      internalPath: "/private/media/root",
    };

    await library.save(renderId, manifest);

    expect(await library.getRun(renderId)).toEqual({
      renderId,
      status: "failed",
      error: {
        stage: "rendering_video",
        code: "RENDER_FAILED",
        message: "Video render failed",
      },
    });
    expect(await readFile(path.join(root, renderId, "manifest.json"), "utf8")).not.toContain(
      "/private/",
    );
  });
});
