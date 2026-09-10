// SPDX-License-Identifier: Apache-2.0

import type { RenderStage } from "./types";

export type SafeDiagnostic = Readonly<{
  stage: RenderStage | "media";
  code:
    | "CLEANUP_FAILED"
    | "STORAGE_FAILED"
    | "STORAGE_UNAVAILABLE"
    | "CLOSE_FAILED"
    | "IMAGE_MEDIA_PROCESS_FAILED";
}>;

export type DiagnosticSink = (diagnostic: SafeDiagnostic) => void;

export const defaultDiagnosticSink: DiagnosticSink = (diagnostic) => {
  console.error("[onevoice]", diagnostic);
};
