// SPDX-License-Identifier: Apache-2.0
//
// Observability determinism-check for render_events ledger (T12).
// Groups successful renders by (script_sha256, renderer_revision) and detects
// differing byte outputs for identical inputs, highlighting non-deterministic
// video encoding runs across workers or revisions.

import type { RenderEventRow } from "@/lib/stats/aggregations";

export type DeterminismAnomaly = Readonly<{
  script_sha256: string;
  renderer_revision: string;
  render_ids: readonly string[];
  byte_variants: readonly number[];
}>;

function coerceBytes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Scans render event rows to detect determinism anomalies.
 * Filter criteria:
 * - status === "succeeded"
 * - non-null script_sha256
 * - non-null renderer_revision
 * - non-null video_bytes
 *
 * Groups by `${script_sha256}:${renderer_revision}`.
 * If a group contains differing video_bytes values, emits an anomaly record
 * containing the unique byte variants and affected render IDs.
 */
export function findDeterminismAnomalies(
  rows: readonly RenderEventRow[],
): DeterminismAnomaly[] {
  const groupMap = new Map<
    string,
    {
      script_sha256: string;
      renderer_revision: string;
      render_ids: string[];
      byte_variants: Set<number>;
    }
  >();

  for (const row of rows) {
    if (row.status !== "succeeded") continue;
    if (!row.script_sha256 || typeof row.script_sha256 !== "string") continue;
    if (!row.renderer_revision || typeof row.renderer_revision !== "string") continue;

    const bytes = coerceBytes(row.video_bytes);
    if (bytes === null) continue;

    const groupKey = `${row.script_sha256}:${row.renderer_revision}`;
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        script_sha256: row.script_sha256,
        renderer_revision: row.renderer_revision,
        render_ids: [],
        byte_variants: new Set<number>(),
      };
      groupMap.set(groupKey, group);
    }

    group.render_ids.push(row.render_id);
    group.byte_variants.add(bytes);
  }

  const anomalies: DeterminismAnomaly[] = [];

  for (const group of groupMap.values()) {
    if (group.byte_variants.size > 1) {
      anomalies.push({
        script_sha256: group.script_sha256,
        renderer_revision: group.renderer_revision,
        render_ids: [...group.render_ids],
        byte_variants: Array.from(group.byte_variants).sort((a, b) => a - b),
      });
    }
  }

  return anomalies;
}
