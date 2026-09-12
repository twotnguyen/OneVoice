// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { RenderEventRow } from "./aggregations";
import { findDeterminismAnomalies } from "./determinism-check";

const ORG = "a0000000-0000-0000-0000-000000000001";

function makeRow(overrides: Partial<RenderEventRow> = {}): RenderEventRow {
  return {
    render_id: "b0000000-0000-4000-8000-000000000001",
    organization_id: ORG,
    product_id: "prod-1",
    status: "succeeded",
    error_stage: null,
    error_code: null,
    model: "gpt-4o-mini",
    tokens_input: 100,
    tokens_output: 50,
    tokens_total: 150,
    stage_timings: { rendering_video: 5000 },
    total_duration_ms: 12000,
    video_bytes: 1_048_576,
    video_duration_ms: 12000,
    renderer_revision: "onevoice-template-v1",
    script_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    created_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("findDeterminismAnomalies", () => {
  it("returns empty array for empty rows", () => {
    expect(findDeterminismAnomalies([])).toEqual([]);
  });

  it("returns no anomaly when identical hash and same revision produce same bytes", () => {
    const rows = [
      makeRow({
        render_id: "render-1",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 2_000_000,
      }),
      makeRow({
        render_id: "render-2",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 2_000_000,
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toEqual([]);
  });

  it("correctly identifies anomaly when identical hash and same revision have differing bytes", () => {
    const rows = [
      makeRow({
        render_id: "render-1",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 2_000_100,
      }),
      makeRow({
        render_id: "render-2",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 2_000_200,
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toEqual([
      {
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        render_ids: ["render-1", "render-2"],
        byte_variants: [2_000_100, 2_000_200],
      },
    ]);
  });

  it("handles multiple renders in an anomaly group and returns unique sorted byte variants", () => {
    const rows = [
      makeRow({
        render_id: "render-1",
        script_sha256: "hash-beta",
        renderer_revision: "rev-v1",
        video_bytes: 3_000_000,
      }),
      makeRow({
        render_id: "render-2",
        script_sha256: "hash-beta",
        renderer_revision: "rev-v1",
        video_bytes: 1_500_000,
      }),
      makeRow({
        render_id: "render-3",
        script_sha256: "hash-beta",
        renderer_revision: "rev-v1",
        video_bytes: 3_000_000, // duplicate bytes variant
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toEqual({
      script_sha256: "hash-beta",
      renderer_revision: "rev-v1",
      render_ids: ["render-1", "render-2", "render-3"],
      byte_variants: [1_500_000, 3_000_000],
    });
  });

  it("does not flag false anomaly when differing bytes belong to different hash or different revision", () => {
    const rows = [
      makeRow({
        render_id: "render-1",
        script_sha256: "hash-1",
        renderer_revision: "rev-v1",
        video_bytes: 1_000_000,
      }),
      makeRow({
        render_id: "render-2",
        script_sha256: "hash-2", // different hash
        renderer_revision: "rev-v1",
        video_bytes: 1_200_000,
      }),
      makeRow({
        render_id: "render-3",
        script_sha256: "hash-1",
        renderer_revision: "rev-v2", // different revision
        video_bytes: 1_500_000,
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toEqual([]);
  });

  it("ignores failed rows or rows with null hash, revision, or bytes", () => {
    const rows = [
      // Succeeded row
      makeRow({
        render_id: "render-valid",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 1_000_000,
      }),
      // Failed row with differing bytes
      makeRow({
        render_id: "render-failed",
        status: "failed",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: 2_000_000,
      }),
      // Row with null script_sha256
      makeRow({
        render_id: "render-null-hash",
        script_sha256: null,
        renderer_revision: "rev-v1",
        video_bytes: 3_000_000,
      }),
      // Row with null renderer_revision
      makeRow({
        render_id: "render-null-rev",
        script_sha256: "hash-alpha",
        renderer_revision: null,
        video_bytes: 4_000_000,
      }),
      // Row with null video_bytes
      makeRow({
        render_id: "render-null-bytes",
        script_sha256: "hash-alpha",
        renderer_revision: "rev-v1",
        video_bytes: null,
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toEqual([]);
  });

  it("correctly coerces numeric string video_bytes", () => {
    const rows = [
      makeRow({
        render_id: "render-1",
        script_sha256: "hash-gamma",
        renderer_revision: "rev-v1",
        video_bytes: "2048000",
      }),
      makeRow({
        render_id: "render-2",
        script_sha256: "hash-gamma",
        renderer_revision: "rev-v1",
        video_bytes: 2048500,
      }),
    ];

    const anomalies = findDeterminismAnomalies(rows);
    expect(anomalies).toEqual([
      {
        script_sha256: "hash-gamma",
        renderer_revision: "rev-v1",
        render_ids: ["render-1", "render-2"],
        byte_variants: [2048000, 2048500],
      },
    ]);
  });
});
