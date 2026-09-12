// SPDX-License-Identifier: Apache-2.0
// N4: both composition roots must derive a byte-identical absolute queueRoot
// from identical env — including the relative ONEVOICE_MEDIA_ROOT case, which
// is the one that actually drifts (different cwd per process => enqueue into
// a directory the worker never reads, with no error anywhere).

import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveRuntimePaths } from "./runtime-composition";

describe("resolveRuntimePaths", () => {
  it("derives identical queueRoot from identical env, including relative media root", () => {
    const appPaths = resolveRuntimePaths({ mediaRoot: "renders", ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", cwd: "/app/a" });
    const workerPaths = resolveRuntimePaths({ mediaRoot: "renders", ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", cwd: "/app/a" });
    expect(appPaths.queueRoot).toBe(workerPaths.queueRoot);
    expect(appPaths.queueRoot).toBe(path.resolve("/app/a", "renders", "queue"));
  });

  it("explicit ONEVOICE_QUEUE_ROOT wins over the default", () => {
    const paths = resolveRuntimePaths({
      mediaRoot: "renders",
      queueRoot: "/data/queue",
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      cwd: "/app/a",
    });
    expect(paths.queueRoot).toBe("/data/queue");
  });

  it("relative queue root resolves against cwd identically", () => {
    const first = resolveRuntimePaths({ mediaRoot: "renders", queueRoot: "shared/q", ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", cwd: "/app/a" });
    const second = resolveRuntimePaths({ mediaRoot: "renders", queueRoot: "shared/q", ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", cwd: "/app/a" });
    expect(first.queueRoot).toBe(second.queueRoot);
  });
});
