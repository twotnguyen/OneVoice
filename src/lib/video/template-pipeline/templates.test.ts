// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEMPLATES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "assets") continue;
      out.push(...htmlFiles(full));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function fontRefs(html: string): string[] {
  const refs: string[] = [];
  const pattern = /url\('assets\/fonts\/([^']+)'\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) refs.push(match[1]);
  return refs;
}

describe("template-pipeline/templates", () => {
  it("contains zero remote font or upstream-brand references", () => {
    const violations: string[] = [];
    for (const file of htmlFiles(TEMPLATES_ROOT)) {
      const html = readFileSync(file, "utf8");
      if (html.includes("https://fonts.googleapis.com"))
        violations.push(`${file}: remote fonts.googleapis.com`);
      if (html.includes("https://fonts.gstatic.com"))
        violations.push(`${file}: remote fonts.gstatic.com`);
      if (html.includes("aicodingvn")) violations.push(`${file}: aicodingvn`);
      if (html.includes("AI Coding")) violations.push(`${file}: AI Coding`);
    }
    expect(violations).toEqual([]);
  });

  it("resolves every @font-face src to a non-empty file on disk", () => {
    const missing: string[] = [];
    for (const file of htmlFiles(TEMPLATES_ROOT)) {
      const html = readFileSync(file, "utf8");
      // compositions/*.html sit one level deeper than the template assets/ dir.
      const parent = dirname(file);
      const assetsBase = basename(parent) === "compositions" ? dirname(parent) : parent;
      for (const ref of fontRefs(html)) {
        const full = join(assetsBase, "assets", "fonts", ref);
        if (!existsSync(full) || statSync(full).size === 0)
          missing.push(`${file}: ${ref}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
