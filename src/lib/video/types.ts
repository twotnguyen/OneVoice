// SPDX-License-Identifier: Apache-2.0

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
    rendererRevision: "onevoice-ffmpeg-v1" | "onevoice-template-v1";
    timings?: Readonly<Record<string, number>>;
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
      code: "AI_GENERATION_FAILED" | "SCRIPT_SCHEMA_INVALID" | "SCRIPT_TRUTH_VIOLATION" | "SCRIPT_DURATION_EXCEEDED";
    }>
  | Readonly<{
      stage: "synthesizing_voice";
      code: "TTS_UNAVAILABLE" | "TTS_TIMEOUT" | "NARRATION_OVERRUNS_SCENE";
    }>
  | Readonly<{
      stage: "resolving_asset";
      code: "IMAGE_RESOLUTION_FAILED";
    }>
  | Readonly<{
      stage: "rendering_video";
      code: "VIDEO_RENDER_FAILED" | "WORKER_LOST";
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

/**
 * The storage seam for a persisted render's video bytes. Deliberately free of any
 * `node:fs` handle so a non-local store (object storage, a distribution-channel
 * adapter) can implement it: it exposes only a byte count, a ranged byte stream, and
 * an idempotent release. Whatever the store opened is owned by this object, not the
 * HTTP route.
 */
export type StoredVideo = Readonly<{
  size: number;
  /** Yields bytes `[start, end]` inclusive as chunks. Throws if the source ends early. */
  stream(start: number, end: number): AsyncIterable<Uint8Array>;
  /** Idempotent; safe to call from any response path including client disconnect. */
  close(): Promise<void>;
}>;
