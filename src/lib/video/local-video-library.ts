// SPDX-License-Identifier: Apache-2.0

import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { RenderedVideo, StoredVideo, VideoManifest } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const COPY_CHUNK_BYTES = 64 * 1024;

type LibraryOptions = Readonly<{
  openFile?: typeof open;
}>;

const contentSchema = z
  .object({
    hook: z.string().min(8).max(90),
    caption: z.string().min(20).max(280),
    cta: z.string().min(3).max(60),
  })
  .strict();
const artifactSchema = z
  .object({
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    durationMs: z.number().int().positive().max(60_000),
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    codecName: z.literal("h264"),
    pixelFormat: z.literal("yuv420p"),
    formatName: z.string().min(1).max(128),
    rendererRevision: z.string().min(1).max(80),
  })
  .strict()
  .refine((artifact) => artifact.width * artifact.height <= 40_000_000);
const errorSchema = z.discriminatedUnion("stage", [
  z
    .object({
      stage: z.literal("loading_product"),
      code: z.enum(["CATALOG_FAILED", "PRODUCT_NOT_FOUND"]),
    })
    .strict(),
  z
    .object({
      stage: z.literal("generating_content"),
      code: z.literal("AI_GENERATION_FAILED"),
    })
    .strict(),
  z
    .object({
      stage: z.literal("resolving_asset"),
      code: z.literal("IMAGE_RESOLUTION_FAILED"),
    })
    .strict(),
  z
    .object({
      stage: z.literal("rendering_video"),
      code: z.literal("VIDEO_RENDER_FAILED"),
    })
    .strict(),
  z
    .object({
      stage: z.literal("storing_artifact"),
      code: z.literal("STORAGE_FAILED"),
    })
    .strict(),
]);
const manifestSchema = z.discriminatedUnion("status", [
  z
    .object({
      renderId: z.string().regex(UUID_PATTERN),
      status: z.literal("succeeded"),
      content: contentSchema,
      artifact: artifactSchema,
    })
    .strict(),
  z
    .object({
      renderId: z.string().regex(UUID_PATTERN),
      status: z.literal("failed"),
      content: contentSchema.optional(),
      error: errorSchema,
    })
    .strict(),
]);

function parseManifest(value: unknown): VideoManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid video manifest");
  return parsed.data as VideoManifest;
}

async function pathIsMissing(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

export class LocalVideoLibrary {
  private readonly root: string;
  private readonly openFile: typeof open;

  constructor(root: string, options: LibraryOptions = {}) {
    this.root = path.resolve(root);
    this.openFile = options.openFile ?? open;
  }

  private validateRenderId(renderId: string): void {
    if (!UUID_PATTERN.test(renderId)) throw new Error("Invalid render ID");
  }

  private async safeRoot(): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const details = await lstat(this.root);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error("Unsafe media root");
    }
    const rootRealPath = await realpath(this.root);
    const handle = await this.openFile(rootRealPath, constants.O_RDONLY | DIRECTORY | NO_FOLLOW);
    await handle.close();
    return rootRealPath;
  }

  private async safeRenderDirectory(renderId: string): Promise<string | null> {
    this.validateRenderId(renderId);
    const root = await this.safeRoot();
    const directory = path.join(root, renderId);
    let details;
    try {
      details = await lstat(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error("Unsafe render directory");
    }
    const directoryRealPath = await realpath(directory);
    if (!directoryRealPath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Unsafe render directory");
    }
    return directoryRealPath;
  }

  async save(
    renderId: string,
    manifest: VideoManifest,
    video?: RenderedVideo,
  ): Promise<void> {
    this.validateRenderId(renderId);
    if (manifest.renderId !== renderId) throw new Error("Manifest render ID does not match");
    const validatedManifest = parseManifest(manifest);
    if (validatedManifest.status === "succeeded" && !video) {
      throw new Error("Successful render requires a video artifact");
    }
    if (validatedManifest.status === "failed" && video) {
      throw new Error("Failed render cannot contain a video artifact");
    }
    const serializedManifest = `${JSON.stringify(validatedManifest)}\n`;
    const root = await this.safeRoot();
    const finalDirectory = path.join(root, renderId);
    if (!(await pathIsMissing(finalDirectory))) {
      if ((await lstat(finalDirectory)).isSymbolicLink()) {
        throw new Error("Unsafe render directory");
      }
      throw new Error("Render ID already exists");
    }

    let stagingDirectory: string | null = await mkdtemp(path.join(root, ".stage-"));
    try {
      const stageRealPath = await realpath(stagingDirectory);
      if (!stageRealPath.startsWith(`${root}${path.sep}`)) {
        throw new Error("Unsafe staging directory");
      }
      const manifestHandle = await this.openFile(
        path.join(stageRealPath, "manifest.json"),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
        0o600,
      );
      try {
        await manifestHandle.writeFile(serializedManifest, "utf8");
        await manifestHandle.sync();
      } finally {
        await manifestHandle.close();
      }

      if (video) {
        const sourceHandle = await this.openFile(video.path, constants.O_RDONLY | NO_FOLLOW);
        let targetHandle: Awaited<ReturnType<typeof open>> | null = null;
        try {
          targetHandle = await this.openFile(
            path.join(stageRealPath, "video.mp4"),
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
            0o600,
          );
          if (!(await sourceHandle.stat()).isFile()) throw new Error("Unsafe rendered video");
          const buffer = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
          let sourcePosition = 0;
          let targetPosition = 0;
          while (true) {
            const { bytesRead } = await sourceHandle.read(
              buffer,
              0,
              buffer.length,
              sourcePosition,
            );
            if (bytesRead === 0) break;
            sourcePosition += bytesRead;
            let chunkOffset = 0;
            while (chunkOffset < bytesRead) {
              const { bytesWritten } = await targetHandle.write(
                buffer,
                chunkOffset,
                bytesRead - chunkOffset,
                targetPosition,
              );
              if (bytesWritten === 0) throw new Error("Failed to copy rendered video");
              chunkOffset += bytesWritten;
              targetPosition += bytesWritten;
            }
          }
          await targetHandle.sync();
        } finally {
          await Promise.allSettled([
            sourceHandle.close(),
            ...(targetHandle ? [targetHandle.close()] : []),
          ]);
        }
      }

      if (!(await pathIsMissing(finalDirectory))) throw new Error("Render ID already exists");
      await rename(stageRealPath, finalDirectory);
      stagingDirectory = null;
    } finally {
      if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
    }
  }

  async getRun(renderId: string): Promise<VideoManifest | null> {
    const directory = await this.safeRenderDirectory(renderId);
    if (!directory) return null;
    const manifestPath = path.join(directory, "manifest.json");
    if (await pathIsMissing(manifestPath)) return null;
    const details = await lstat(manifestPath);
    if (details.isSymbolicLink() || !details.isFile()) throw new Error("Unsafe manifest file");
    const handle = await this.openFile(manifestPath, constants.O_RDONLY | NO_FOLLOW);
    try {
      if (!(await handle.stat()).isFile()) throw new Error("Unsafe manifest file");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await handle.readFile("utf8")) as unknown;
      } catch {
        throw new Error("Invalid video manifest");
      }
      return parseManifest(parsed);
    } finally {
      await handle.close();
    }
  }

  async readVideo(renderId: string): Promise<StoredVideo | null> {
    const directory = await this.safeRenderDirectory(renderId);
    if (!directory) return null;
    const videoPath = path.join(directory, "video.mp4");
    if (await pathIsMissing(videoPath)) return null;
    const details = await lstat(videoPath);
    if (details.isSymbolicLink() || !details.isFile()) throw new Error("Unsafe video file");
    const handle = await this.openFile(videoPath, constants.O_RDONLY | NO_FOLLOW);
    try {
      const openedDetails = await handle.stat();
      if (!openedDetails.isFile()) throw new Error("Unsafe video file");
      return { handle, size: openedDetails.size };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
}
