// SPDX-License-Identifier: Apache-2.0
//
// Insert-only backfill logic over on-disk render dirs. No `import
// "server-only"` — unit tests import this module directly (see D5).

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { VideoManifest } from "@/lib/video/types";
import {
  manifestToRenderEvent,
  type RenderEventInsert,
} from "./render-event.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List render dirs under mediaRoot (each dir may hold a manifest.json). */
export async function walkManifests(mediaRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(mediaRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(mediaRoot, entry.name, "manifest.json"));
}

/**
 * Parse one manifest file. Returns null for: missing file, truncated/invalid
 * JSON, missing/invalid renderId, unknown status shape. Unknown keys are
 * ignored.
 */
export async function parseManifestFile(manifestPath: string): Promise<VideoManifest | null> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.renderId !== "string" || !UUID_PATTERN.test(record.renderId)) return null;
  if (record.status === "succeeded") {
    const artifact = record.artifact as Record<string, unknown> | undefined;
    if (
      typeof artifact !== "object" ||
      artifact === null ||
      typeof artifact.bytes !== "number" ||
      typeof artifact.durationMs !== "number"
    ) {
      return null;
    }
    return value as VideoManifest;
  }
  if (record.status === "failed") {
    const error = record.error as Record<string, unknown> | undefined;
    if (
      typeof error !== "object" ||
      error === null ||
      typeof error.stage !== "string" ||
      typeof error.code !== "string"
    ) {
      return null;
    }
    return value as VideoManifest;
  }
  return null;
}

/** Walk + parse + map every render dir to a legacy insert row. */
export async function buildBackfillRows(
  mediaRoot: string,
  organizationId: string,
): Promise<RenderEventInsert[]> {
  const paths = await walkManifests(mediaRoot);
  const rows: RenderEventInsert[] = [];
  for (const manifestPath of paths) {
    const manifest = await parseManifestFile(manifestPath);
    if (!manifest) continue;
    // created_at ← render-dir mtime (documented approximate).
    const { mtime } = await stat(path.dirname(manifestPath));
    rows.push(
      manifestToRenderEvent(manifest, {
        organizationId,
        createdAt: mtime.toISOString(),
      }),
    );
  }
  return rows;
}
