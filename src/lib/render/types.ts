// SPDX-License-Identifier: Apache-2.0

import type { VideoManifest, VideoManifestContent, VideoManifestError } from "@/lib/video/types";

export type RenderStage =
  | "loading_product"
  | "generating_content"
  | "resolving_asset"
  | "synthesizing_voice"
  | "composing_scenes"
  | "rendering_video"
  | "storing_artifact";

export type RenderError = VideoManifestError;

/**
 * The on-disk record and the pipeline result. This is the persistence shape and is the
 * only thing validated by `manifestSchema` in local-video-library.ts. Do NOT return it
 * straight over HTTP — project it through {@link toRenderRunView} first.
 */
export type RenderRun = VideoManifest;

/**
 * The explicit wire/UI projection of a terminal {@link RenderRun}. HTTP routes serialise
 * this shape, never the raw manifest, so a new persisted field (asset ref, publication
 * record, claims passport) does not force a lockstep API + client change. The browser
 * mirror is `RenderResponse` in src/app/video-studio-state.ts — keep the two in sync.
 */
export type RenderRunView =
  | Readonly<{
      renderId: string;
      status: "succeeded";
      content: VideoManifestContent;
    }>
  | Readonly<{
      renderId: string;
      status: "failed";
      content?: VideoManifestContent;
      error: VideoManifestError;
    }>;

/**
 * Pure projection from the persistence record to the wire shape. Drops persistence-only
 * detail (currently the whole `artifact` block: byte size, sha256, exact codec strings)
 * that no client consumes.
 */
export function toRenderRunView(manifest: VideoManifest): RenderRunView {
  if (manifest.status === "succeeded") {
    return {
      renderId: manifest.renderId,
      status: "succeeded",
      content: manifest.content,
    };
  }
  return {
    renderId: manifest.renderId,
    status: "failed",
    ...(manifest.content ? { content: manifest.content } : {}),
    error: manifest.error,
  };
}
