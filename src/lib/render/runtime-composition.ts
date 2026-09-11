// SPDX-License-Identifier: Apache-2.0
// Shared, server-only-free construction consumed by both composition roots:
// the app-side composition-root.ts and src/worker/composition.ts (N4). Holds
// the absoluteRuntimePath helper plus the mediaRoot -> queueRoot derivation
// (ONEVOICE_QUEUE_ROOT defaults to <mediaRoot>/queue) and the
// CatalogRepository / LocalVideoLibrary / FileJobQueue builders. Both roots
// add only what is theirs alone. No `import "server-only"` here.

import path from "node:path";

import { CatalogRepository } from "@/lib/catalog/repository";
import { FileJobQueue } from "@/lib/queue/file-queue";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";

import { resolveExecutablePath } from "./runtime-paths";

export function absoluteRuntimePath(value: string, cwd = process.cwd()): string {
  return path.isAbsolute(value)
    ? value
    : path.resolve(/* turbopackIgnore: true */ cwd, value);
}

export type RuntimePaths = Readonly<{
  mediaRoot: string;
  queueRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
}>;

export function resolveRuntimePaths(options: {
  mediaRoot: string;
  queueRoot?: string;
  ffmpegPath: string;
  ffprobePath: string;
  cwd?: string;
}): RuntimePaths {
  const cwd = options.cwd ?? process.cwd();
  const mediaRoot = absoluteRuntimePath(options.mediaRoot, cwd);
  return {
    mediaRoot,
    queueRoot: options.queueRoot ? absoluteRuntimePath(options.queueRoot, cwd) : path.join(mediaRoot, "queue"),
    ffmpegPath: resolveExecutablePath(options.ffmpegPath, cwd),
    ffprobePath: resolveExecutablePath(options.ffprobePath, cwd),
  };
}

export type SharedStores = Readonly<{
  catalog: CatalogRepository;
  library: LocalVideoLibrary;
  queue: FileJobQueue;
  paths: RuntimePaths;
}>;

export function buildSharedStores(options: {
  paths: RuntimePaths;
  catalogClient: ConstructorParameters<typeof CatalogRepository>[0]["client"];
  defaultOrganizationId: string;
  onJobLost?: ConstructorParameters<typeof FileJobQueue>[0]["onJobLost"];
}): SharedStores {
  const catalog = new CatalogRepository({
    client: options.catalogClient,
    defaultOrganizationId: options.defaultOrganizationId,
  });
  const library = new LocalVideoLibrary(options.paths.mediaRoot);
  const queue = new FileJobQueue(
    options.onJobLost ? { root: options.paths.queueRoot, onJobLost: options.onJobLost } : { root: options.paths.queueRoot },
  );
  return { catalog, library, queue, paths: options.paths };
}
