// SPDX-License-Identifier: Apache-2.0

import type { FileHandle } from "node:fs/promises";

export type VideoScene = Readonly<{
  kind: "hook" | "facts" | "cta";
  durationMs: 4_000;
  lines: readonly string[];
}>;

export type VideoStoryboard = Readonly<{
  schema: "onevoice.storyboard.v1";
  template: "product-spotlight-v1";
  canvas: Readonly<{
    width: 1080;
    height: 1920;
    fps: 30;
    durationMs: 12_000;
  }>;
  scenes: readonly [VideoScene, VideoScene, VideoScene];
}>;

export type ResolvedAsset = Readonly<{
  path: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
  sha256: string;
  cleanup: () => Promise<void>;
}>;

export type VideoProbe = Readonly<{
  formatName: string;
  codecName: string;
  pixelFormat: string;
  width: number;
  height: number;
  durationMs: number;
}>;

export type RenderedVideo = VideoProbe &
  Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    rendererRevision: "onevoice-ffmpeg-v1";
    cleanup: () => Promise<void>;
  }>;

export type VideoRenderRequest = Readonly<{
  storyboard: VideoStoryboard;
  imagePath?: string;
}>;

export type VideoArtifactMetadata = Readonly<{
  bytes: number;
  sha256: string;
  durationMs: number;
  width: number;
  height: number;
  codecName: string;
  pixelFormat: string;
  formatName: string;
  rendererRevision: string;
}>;

export type VideoManifestContent = Readonly<{
  hook: string;
  caption: string;
  cta: string;
}>;

export type VideoManifestError =
  | Readonly<{
      stage: "loading_product";
      code: "CATALOG_FAILED" | "PRODUCT_NOT_FOUND";
    }>
  | Readonly<{
      stage: "generating_content";
      code: "AI_GENERATION_FAILED";
    }>
  | Readonly<{
      stage: "rendering_video";
      code: "VIDEO_RENDER_FAILED";
    }>
  | Readonly<{
      stage: "storing_artifact";
      code: "STORAGE_FAILED";
    }>;

export type VideoManifest =
  | Readonly<{
      renderId: string;
      status: "succeeded";
      content: VideoManifestContent;
      artifact: VideoArtifactMetadata;
    }>
  | Readonly<{
      renderId: string;
      status: "failed";
      content?: VideoManifestContent;
      error: VideoManifestError;
    }>;

export type StoredVideo = Readonly<{
  handle: FileHandle;
  size: number;
}>;
