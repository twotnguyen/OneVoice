// SPDX-License-Identifier: Apache-2.0

import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LocalVideoLibrary } from "./local-video-library";
import type { RenderedVideo, VideoManifest } from "./types";

const roots: string[] = [];
const renderId = "550e8400-e29b-41d4-a716-446655440000";

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

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
      sha256: "a".repeat(64),
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
      content: {
        hook: "A valid product hook",
        caption: "A valid product caption for this test.",
        cta: "View product",
      },
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
    const stored = await library.readVideo(renderId);
    expect(stored?.size).toBe(4);
    await expect(collect(stored!.stream(0, stored!.size - 1))).resolves.toEqual(Buffer.from([0, 1, 2, 3]));
    await stored!.close();
    await expect(stored!.close()).resolves.toBeUndefined();
    expect(await readFile(path.join(directory, "manifest.json"), "utf8")).not.toContain(sourcePath);
  });

  it("stores a failed safe manifest without creating a video", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const manifest: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "VIDEO_RENDER_FAILED" },
    };

    await library.save(renderId, manifest);

    await expect(library.getRun(renderId)).resolves.toEqual(manifest);
    await expect(library.readVideo(renderId)).resolves.toBeNull();
    expect(await readdir(path.join(root, renderId))).toEqual(["manifest.json"]);
  });

  it("stores the strict image-resolution failure manifest", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const manifest: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "resolving_asset", code: "IMAGE_RESOLUTION_FAILED" },
    };

    await library.save(renderId, manifest);

    await expect(library.getRun(renderId)).resolves.toEqual(manifest);
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
        error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
      }),
    ).rejects.toThrow("Manifest render ID does not match");
  });

  it("rejects unbounded or mismatched failure fields before persistence", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const manifest = {
      renderId,
      status: "failed" as const,
      error: {
        stage: "rendering_video",
        code: "AI_GENERATION_FAILED",
        message: "secret=/private/render/work.mp4",
      },
    };

    await expect(library.save(renderId, manifest as never)).rejects.toThrow("Invalid video manifest");
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("rejects an existing render ID without replacing its artifact", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "source.mp4");
    await writeFile(sourcePath, Buffer.from([1, 2, 3]));
    const libraryRoot = path.join(root, "library");
    const library = new LocalVideoLibrary(libraryRoot);
    const failed: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    };
    await library.save(renderId, failed);

    await expect(library.save(renderId, failed)).rejects.toThrow("Render ID already exists");
    await expect(library.getRun(renderId)).resolves.toEqual(failed);
    expect(await readdir(libraryRoot)).toEqual([renderId]);
  });

  it("removes staging data when video staging fails", async () => {
    const root = await temporaryRoot();
    const library = new LocalVideoLibrary(root);
    const video: RenderedVideo = {
      path: path.join(root, "missing.mp4"),
      bytes: 4,
      sha256: "a".repeat(64),
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
      content: {
        hook: "A valid product hook",
        caption: "A valid product caption for this test.",
        cta: "View product",
      },
      artifact: {
        bytes: 4,
        sha256: "a".repeat(64),
        durationMs: 12_000,
        width: 1080,
        height: 1920,
        codecName: "h264",
        pixelFormat: "yuv420p",
        formatName: "mov,mp4,m4a,3gp,3g2,mj2",
        rendererRevision: "onevoice-ffmpeg-v1",
      },
    };

    await expect(library.save(renderId, manifest, video)).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("rejects a symlink media root and render directory", async () => {
    const parent = await temporaryRoot();
    const outside = path.join(parent, "outside");
    const linkedRoot = path.join(parent, "linked-root");
    await mkdir(outside);
    await symlink(outside, linkedRoot, "dir");
    const failed: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    };

    await expect(new LocalVideoLibrary(linkedRoot).save(renderId, failed)).rejects.toThrow(
      "Unsafe media root",
    );
    expect(await readdir(outside)).toEqual([]);

    const safeRoot = path.join(parent, "safe-root");
    await mkdir(safeRoot);
    await symlink(outside, path.join(safeRoot, renderId), "dir");
    await expect(new LocalVideoLibrary(safeRoot).save(renderId, failed)).rejects.toThrow(
      "Unsafe render directory",
    );
    expect(await readdir(outside)).toEqual([]);
  });

  it("opens manifests and videos without following file symlinks", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, renderId);
    const outsideManifest = path.join(root, "outside-manifest.json");
    const outsideVideo = path.join(root, "outside-video.mp4");
    await mkdir(directory);
    await writeFile(outsideManifest, JSON.stringify({ renderId, status: "failed" }));
    await writeFile(outsideVideo, Buffer.from([9, 9, 9]));
    await symlink(outsideManifest, path.join(directory, "manifest.json"));
    await symlink(outsideVideo, path.join(directory, "video.mp4"));
    const library = new LocalVideoLibrary(root);

    await expect(library.getRun(renderId)).rejects.toThrow("Unsafe manifest file");
    await expect(library.readVideo(renderId)).rejects.toThrow("Unsafe video file");
  });

  it("rejects malformed persisted manifests without leaking their contents", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, renderId);
    await mkdir(directory);
    await writeFile(path.join(directory, "manifest.json"), "secret=/private/catalog.json");
    const library = new LocalVideoLibrary(root);

    const error = await library.getRun(renderId).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Invalid video manifest");
    expect((error as Error).message).not.toContain("secret");
  });

  it("returns a stored video whose stream stays bound to the validated inode", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "source.mp4");
    await writeFile(sourcePath, Buffer.from([1, 2, 3, 4]));
    const library = new LocalVideoLibrary(path.join(root, "library"));
    const video = {
      path: sourcePath,
      bytes: 4,
      sha256: "a".repeat(64),
      durationMs: 12_000,
      width: 1080,
      height: 1920,
      codecName: "h264",
      pixelFormat: "yuv420p",
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      rendererRevision: "onevoice-ffmpeg-v1" as const,
      cleanup: async () => undefined,
    };
    const manifest: VideoManifest = {
      renderId,
      status: "succeeded",
      content: {
        hook: "A valid product hook",
        caption: "A valid product caption for this test.",
        cta: "View product",
      },
      artifact: {
        bytes: 4,
        sha256: "a".repeat(64),
        durationMs: 12_000,
        width: 1080,
        height: 1920,
        codecName: "h264",
        pixelFormat: "yuv420p",
        formatName: "mov,mp4,m4a,3gp,3g2,mj2",
        rendererRevision: "onevoice-ffmpeg-v1",
      },
    };
    await library.save(renderId, manifest, video);
    const stored = await library.readVideo(renderId);
    const published = path.join(root, "library", renderId, "video.mp4");
    await rename(published, `${published}.old`);
    await writeFile(published, Buffer.from([9, 9, 9, 9]));

    await expect(collect(stored!.stream(0, stored!.size - 1))).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
    await stored!.close();
  });

  it("copies a multi-chunk video without whole-file FileHandle buffering", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "large-source.mp4");
    const source = Buffer.alloc(1024 * 1024 + 17, 0x5a);
    await writeFile(sourcePath, source);
    const library = new LocalVideoLibrary(path.join(root, "library"));
    const video: RenderedVideo = {
      path: sourcePath,
      bytes: source.length,
      sha256: "a".repeat(64),
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
      content: {
        hook: "A valid product hook",
        caption: "A valid product caption for this test.",
        cta: "View product",
      },
      artifact: {
        bytes: source.length,
        sha256: "a".repeat(64),
        durationMs: 12_000,
        width: 1080,
        height: 1920,
        codecName: "h264",
        pixelFormat: "yuv420p",
        formatName: "mov,mp4,m4a,3gp,3g2,mj2",
        rendererRevision: "onevoice-ffmpeg-v1",
      },
    };
    const sampleHandle = await open(sourcePath, "r");
    const prototype = Object.getPrototypeOf(sampleHandle) as {
      readFile: FileHandle["readFile"];
    };
    await sampleHandle.close();
    const originalReadFile = prototype.readFile;
    prototype.readFile = (async () => {
      throw new Error("whole-file buffering is forbidden");
    }) as FileHandle["readFile"];

    try {
      await library.save(renderId, manifest, video);
    } finally {
      prototype.readFile = originalReadFile;
    }

    await expect(
      readFile(path.join(root, "library", renderId, "video.mp4")),
    ).resolves.toEqual(source);
  });

  it("closes the opened video handle when post-open validation fails", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, renderId);
    await mkdir(directory);
    await writeFile(path.join(directory, "video.mp4"), Buffer.from([1, 2, 3]));
    let closeCalls = 0;
    const library = new LocalVideoLibrary(root, {
      openFile: async (...args: Parameters<typeof open>) => {
        const handle = await Reflect.apply(open, undefined, args) as FileHandle;
        if (path.basename(String(args[0])) === "video.mp4") {
          const originalClose = handle.close;
          handle.stat = (async () => {
            throw new Error("simulated fstat failure");
          }) as FileHandle["stat"];
          handle.close = async () => {
            closeCalls += 1;
            return originalClose();
          };
        }
        return handle;
      },
    });

    await expect(library.readVideo(renderId)).rejects.toThrow("simulated fstat failure");
    expect(closeCalls).toBe(1);
  });
});
