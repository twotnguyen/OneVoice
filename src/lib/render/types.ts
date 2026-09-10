// SPDX-License-Identifier: Apache-2.0

import type { VideoManifest, VideoManifestError } from "@/lib/video/types";

export type RenderStage =
  | "loading_product"
  | "generating_content"
  | "resolving_asset"
  | "rendering_video"
  | "storing_artifact";

export type RenderError = VideoManifestError;
export type RenderRun = VideoManifest;
