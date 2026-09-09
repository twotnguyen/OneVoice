// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RenderedVideo, StoredVideo, VideoManifest } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeManifest(manifest: VideoManifest): VideoManifest {
  return {
    renderId: manifest.renderId,
    status: manifest.status,
    ...(manifest.content
      ? {
          content: {
            hook: manifest.content.hook,
            caption: manifest.content.caption,
            cta: manifest.content.cta,
          },
        }
      : {}),
    ...(manifest.artifact
      ? {
          artifact: {
            bytes: manifest.artifact.bytes,
            sha256: manifest.artifact.sha256,
            durationMs: manifest.artifact.durationMs,
            width: manifest.artifact.width,
            height: manifest.artifact.height,
            codecName: manifest.artifact.codecName,
            pixelFormat: manifest.artifact.pixelFormat,
            formatName: manifest.artifact.formatName,
            rendererRevision: manifest.artifact.rendererRevision,
          },
        }
      : {}),
    ...(manifest.error
      ? {
          error: {
            stage: manifest.error.stage,
            code: manifest.error.code,
            message: manifest.error.message,
          },
        }
      : {}),
  };
}

export class LocalVideoLibrary {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private artifactDirectory(renderId: string): string {
    if (!UUID_PATTERN.test(renderId)) throw new Error("Invalid render ID");
    const directory = path.resolve(this.root, renderId);
    if (!directory.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Invalid render ID");
    }
    return directory;
  }

  async save(
    renderId: string,
    manifest: VideoManifest,
    video?: RenderedVideo,
  ): Promise<void> {
    const directory = this.artifactDirectory(renderId);
    if (manifest.renderId !== renderId) {
      throw new Error("Manifest render ID does not match");
    }
    if (manifest.status === "succeeded" && (!manifest.artifact || !video)) {
      throw new Error("Successful render requires a video artifact");
    }

    await mkdir(directory, { recursive: true, mode: 0o700 });
    const suffix = randomUUID();
    const temporaryManifest = path.join(directory, `.manifest-${suffix}.tmp`);
    const manifestPath = path.join(directory, "manifest.json");

    if (video) {
      const temporaryVideo = path.join(directory, `.video-${suffix}.tmp`);
      await copyFile(video.path, temporaryVideo);
      await rename(temporaryVideo, path.join(directory, "video.mp4"));
    }

    await writeFile(temporaryManifest, `${JSON.stringify(safeManifest(manifest))}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryManifest, manifestPath);
  }

  async getRun(renderId: string): Promise<VideoManifest | null> {
    const manifestPath = path.join(this.artifactDirectory(renderId), "manifest.json");
    try {
      return JSON.parse(await readFile(manifestPath, "utf8")) as VideoManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async readVideo(renderId: string): Promise<StoredVideo | null> {
    const videoPath = path.join(this.artifactDirectory(renderId), "video.mp4");
    try {
      const details = await stat(videoPath);
      if (!details.isFile()) return null;
      return { path: videoPath, size: details.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
