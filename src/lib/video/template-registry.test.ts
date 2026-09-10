// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { TEMPLATE_IDS, TEMPLATE_REGISTRY } from "./template-registry";

const TEMPLATES_ROOT = path.resolve(__dirname, "template-pipeline/templates");

describe("template-registry", () => {
  it("covers every template directory on disk", () => {
    const dirs = readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...TEMPLATE_IDS].sort()).toEqual(dirs);
  });

  it("naturalDurationMs matches data-duration in each portrait.html", () => {
    for (const id of TEMPLATE_IDS) {
      const html = readFileSync(
        path.join(TEMPLATES_ROOT, id, "compositions/portrait.html"),
        "utf8",
      );
      const match = html.match(/data-duration="(\d+(?:\.\d+)?)"/);
      expect(match, `${id} missing data-duration`).not.toBeNull();
      expect(TEMPLATE_REGISTRY[id].naturalDurationMs).toBe(
        Math.round(Number(match![1]) * 1000),
      );
    }
  });
});
