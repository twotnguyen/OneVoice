// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { VideoManifest } from "@/lib/video/types";
import {
  manifestToRenderEvent,
  runToRenderEvent,
  toRow,
} from "./render-event";

const ORG = "a0000000-0000-0000-0000-000000000001";
const RENDER_ID = "b0000000-0000-4000-8000-000000000001";

const successManifest: VideoManifest = {
  renderId: RENDER_ID,
  status: "succeeded",
  content: { hook: "h", caption: "c", cta: "c" },
  artifact: {
    bytes: 1024,
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

const failedManifest: VideoManifest = {
  renderId: RENDER_ID,
  status: "failed",
  error: { stage: "loading_product", code: "PRODUCT_NOT_FOUND" },
};

describe("manifestToRenderEvent (legacy backfill)", () => {
  it("maps success with video fields and null rich fields", () => {
    const row = manifestToRenderEvent(successManifest, {
      organizationId: ORG,
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    expect(row).toEqual({
      render_id: RENDER_ID,
      organization_id: ORG,
      product_id: null,
      status: "succeeded",
      error_stage: null,
      error_code: null,
      model: null,
      tokens_input: null,
      tokens_output: null,
      tokens_total: null,
      stage_timings: null,
      total_duration_ms: null,
      video_bytes: 1024,
      video_duration_ms: 12_000,
      created_at: "2026-09-01T00:00:00.000Z",
    });
  });

  it("maps failure with error stage/code and null video fields", () => {
    const row = manifestToRenderEvent(failedManifest, {
      organizationId: ORG,
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    expect(row.status).toBe("failed");
    expect(row.error_stage).toBe("loading_product");
    expect(row.error_code).toBe("PRODUCT_NOT_FOUND");
    expect(row.video_bytes).toBeNull();
    expect(row.product_id).toBeNull();
  });
});

describe("runToRenderEvent (live)", () => {
  it("maps success with full live fields", () => {
    const row = runToRenderEvent(successManifest, {
      organizationId: ORG,
      productId: "c0000000-0000-4000-8000-000000000001",
      timings: { loading_product_ms: 3 },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      model: "m",
      totalDurationMs: 42,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    expect(row.product_id).toBe("c0000000-0000-4000-8000-000000000001");
    expect(row.model).toBe("m");
    expect(row.tokens_input).toBe(10);
    expect(row.tokens_total).toBe(30);
    expect(row.stage_timings).toEqual({ loading_product_ms: 3 });
    expect(row.total_duration_ms).toBe(42);
  });

  it("maps PRODUCT_NOT_FOUND with product_id but null live fields", () => {
    const row = runToRenderEvent(failedManifest, {
      organizationId: ORG,
      productId: "c0000000-0000-4000-8000-000000000001",
      timings: { loading_product_ms: 3 },
      usage: undefined,
      model: undefined,
      totalDurationMs: 5,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    expect(row.product_id).toBe("c0000000-0000-4000-8000-000000000001");
    expect(row.model).toBeNull();
    expect(row.tokens_total).toBeNull();
    expect(row.video_bytes).toBeNull();
  });
});

describe("toRow (store input)", () => {
  it("converts RenderEventInput with || fallback on empty usage", () => {
    const row = toRow(
      {
        renderId: RENDER_ID,
        productId: "c0000000-0000-4000-8000-000000000001",
        status: "failed",
        errorStage: "storing_artifact",
        errorCode: "STORAGE_FAILED",
        timings: {},
        totalDurationMs: 7,
        createdAt: "2026-09-10T00:00:00.000Z",
      },
      ORG,
    );
    expect(row.error_stage).toBe("storing_artifact");
    expect(row.model).toBeNull();
    expect(row.tokens_input).toBeNull();
  });
});
