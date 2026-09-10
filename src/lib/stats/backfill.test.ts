// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildBackfillRows,
  parseManifestFile,
  walkManifests,
} from "./backfill";

const ORG = "a0000000-0000-0000-0000-000000000001";
const RID = "b0000000-0000-4000-8000-000000000001";

let roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "backfill-"));
  roots.push(root);
  return root;
}

async function writeManifest(root: string, dir: string, body: string): Promise<string> {
  const dirPath = path.join(root, dir);
  await mkdir(dirPath, { recursive: true });
  const manifestPath = path.join(dirPath, "manifest.json");
  await writeFile(manifestPath, body);
  return manifestPath;
}

const validSuccess = JSON.stringify({
  renderId: RID,
  status: "succeeded",
  content: { hook: "h", caption: "c", cta: "x" },
  artifact: { bytes: 512, durationMs: 12_000 },
  unknownFutureKey: "ignored",
});

describe("walkManifests", () => {
  it("lists manifest paths and skips dot-dirs; missing root → []", async () => {
    const root = await makeRoot();
    await writeManifest(root, RID, validSuccess);
    await writeManifest(root, ".images", validSuccess);
    const paths = await walkManifests(root);
    expect(paths).toHaveLength(1);
    expect(paths[0].endsWith("manifest.json")).toBe(true);
    expect(await walkManifests(path.join(root, "nope"))).toEqual([]);
  });
});

describe("parseManifestFile", () => {
  it("parses valid manifest and ignores unknown keys", async () => {
    const root = await makeRoot();
    const manifestPath = await writeManifest(root, RID, validSuccess);
    const parsed = await parseManifestFile(manifestPath);
    expect(parsed?.renderId).toBe(RID);
  });

  it("returns null for truncated JSON", async () => {
    const root = await makeRoot();
    const manifestPath = await writeManifest(root, RID, '{"renderId":');
    expect(await parseManifestFile(manifestPath)).toBeNull();
  });

  it("returns null for missing renderId", async () => {
    const root = await makeRoot();
    const manifestPath = await writeManifest(root, RID, JSON.stringify({ status: "failed" }));
    expect(await parseManifestFile(manifestPath)).toBeNull();
  });

  it("returns null for unknown status", async () => {
    const root = await makeRoot();
    const manifestPath = await writeManifest(
      root,
      RID,
      JSON.stringify({ renderId: RID, status: "pending" }),
    );
    expect(await parseManifestFile(manifestPath)).toBeNull();
  });

  it("returns null for missing manifest.json", async () => {
    const root = await makeRoot();
    expect(await parseManifestFile(path.join(root, RID, "manifest.json"))).toBeNull();
  });
});

describe("buildBackfillRows", () => {
  it("maps valid dirs, skips bad ones, created_at from mtime", async () => {
    const root = await makeRoot();
    await writeManifest(root, RID, validSuccess);
    await writeManifest(root, "bad-dir", "not json{");
    const rows = await buildBackfillRows(root, ORG);
    expect(rows).toHaveLength(1);
    expect(rows[0].render_id).toBe(RID);
    expect(rows[0].product_id).toBeNull();
    expect(rows[0].model).toBeNull();
    expect(typeof rows[0].created_at).toBe("string");
  });
});
