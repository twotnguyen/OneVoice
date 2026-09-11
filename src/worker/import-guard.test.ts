// SPDX-License-Identifier: Apache-2.0
// Guard: nothing under src/worker/** may transitively import
// composition-root.ts or the "server-only" specifier (C2). A plain Node
// worker importing either dies at import time (server-only is a Next bundler
// alias, not an installed module). Enforced by source scan, not memory.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function workerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await workerFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("worker import guard", () => {
  it("src/worker/** sources import neither composition-root nor server-only", async () => {
    const workerDir = path.resolve(__dirname);
    const violations: string[] = [];
    const importPattern = /^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|await\s+import\(\s*['"]([^'"]+)['"]\s*\)/;
    for (const file of await workerFiles(workerDir)) {
      const source = await readFile(file, "utf8");
      const bad = source.split("\n").some((line) => {
        const match = importPattern.exec(line);
        if (!match) return false;
        const specifier = match[1] ?? match[2] ?? match[3] ?? "";
        return specifier.includes("composition-root") || specifier === "server-only";
      });
      if (bad) violations.push(path.relative(workerDir, file));
    }
    expect(violations).toEqual([]);
  });
});
