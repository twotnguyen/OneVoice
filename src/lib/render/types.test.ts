// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { VideoManifest } from "@/lib/video/types";
import { toRenderRunView } from "./types";

const renderId = "b0000000-0000-4000-8000-000000000001";
const content = {
  hook: "Một lựa chọn đáng chú ý",
  caption: "Nội dung đủ dài cho chiến dịch sản phẩm.",
  cta: "Xem sản phẩm ngay",
};

describe("toRenderRunView", () => {
  it("drops the persistence-only artifact block from a succeeded manifest", () => {
    const manifest: VideoManifest = {
      renderId,
      status: "succeeded",
      content,
      artifact: {
        bytes: 10,
        sha256: "a".repeat(64),
        durationMs: 12_000,
        width: 1080,
        height: 1920,
        codecName: "h264",
        pixelFormat: "yuv420p",
        formatName: "mp4",
        rendererRevision: "onevoice-ffmpeg-v1",
      },
    };

    const view = toRenderRunView(manifest);

    expect(view).toEqual({ renderId, status: "succeeded", content, durationSeconds: 12 });
    expect(view).not.toHaveProperty("artifact");
  });

  it("keeps the error and carries content through a failed manifest", () => {
    const manifest: VideoManifest = {
      renderId,
      status: "failed",
      content,
      error: { stage: "rendering_video", code: "VIDEO_RENDER_FAILED" },
    };

    expect(toRenderRunView(manifest)).toEqual({
      renderId,
      status: "failed",
      content,
      error: { stage: "rendering_video", code: "VIDEO_RENDER_FAILED" },
    });
  });

  it("omits absent content on a failed manifest rather than emitting undefined", () => {
    const manifest: VideoManifest = {
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    };

    const view = toRenderRunView(manifest);

    expect(view).toEqual({
      renderId,
      status: "failed",
      error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
    });
    expect(view).not.toHaveProperty("content");
  });

  it("does not forward an unknown persisted field that a future manifest might add", () => {
    const manifest = {
      renderId,
      status: "succeeded",
      content,
      artifact: {
        bytes: 10,
        sha256: "a".repeat(64),
        durationMs: 12_000,
        width: 1080,
        height: 1920,
        codecName: "h264",
        pixelFormat: "yuv420p",
        formatName: "mp4",
        rendererRevision: "onevoice-ffmpeg-v1",
      },
      publication: { channel: "tiktok", postId: "123" },
    } as unknown as VideoManifest;

    expect(toRenderRunView(manifest)).toEqual({ renderId, status: "succeeded", content, durationSeconds: 12 });
  });
});
