// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveExecutablePath } from "./runtime-paths";

describe("composition runtime executable paths", () => {
  it("keeps PATH commands and absolute executables unchanged", () => {
    expect(resolveExecutablePath("ffmpeg", "/repo")).toBe("ffmpeg");
    expect(resolveExecutablePath("/opt/media/ffmpeg", "/repo")).toBe("/opt/media/ffmpeg");
  });

  it("resolves path-like relative executables from process cwd", () => {
    expect(resolveExecutablePath("tools/ffmpeg", "/repo")).toBe(path.resolve("/repo/tools/ffmpeg"));
    expect(resolveExecutablePath("./bin/ffprobe", "/repo")).toBe(path.resolve("/repo/bin/ffprobe"));
  });
});
