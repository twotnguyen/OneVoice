// SPDX-License-Identifier: Apache-2.0

import "server-only";

import path from "node:path";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { CatalogRepository } from "@/lib/catalog/repository";
import { generateVideoScript } from "@/lib/content/generate-video-script";
import { readServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FfmpegVideoRenderer, sweepStaleIntermediates } from "@/lib/video/ffmpeg-renderer";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";
import { RemoteImageResolver } from "@/lib/video/remote-image-resolver";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { SupabaseRenderEventStore } from "@/lib/stats/render-event-store";
import { ProductVideoPipeline } from "./product-video-pipeline";
import { RenderProgressStore } from "./progress-store";
import { resolveExecutablePath } from "./runtime-paths";

function absoluteRuntimePath(value: string): string {
  return path.isAbsolute(value)
    ? value
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), value);
}

function compose() {
  const environment = readServerEnv();
  const mediaRoot = absoluteRuntimePath(environment.runtime.mediaRoot);
  const scope = { organizationId: environment.runtime.organizationId } as const;
  const ffmpegPath = resolveExecutablePath(environment.runtime.ffmpegPath);
  const ffprobePath = resolveExecutablePath(environment.runtime.ffprobePath);
  const catalog = new CatalogRepository({
    client: createSupabaseServerClient(),
    defaultOrganizationId: scope.organizationId,
  });
  const provider = new OpenAICompatibleProvider(environment.ai);
  const imageResolver = new RemoteImageResolver({
    allowedHostnames: environment.runtime.imageHosts,
    temporaryRoot: path.join(mediaRoot, ".images"),
    ffmpegPath,
    ffprobePath,
  });
  const renderer = new FfmpegVideoRenderer({
    outputRoot: path.join(mediaRoot, ".output"),
    ffmpegPath,
    ffprobePath,
    fontPath: environment.runtime.fontPath,
  });
  const library = new LocalVideoLibrary(mediaRoot);
  // Best-effort sweep of intermediate artifacts orphaned by a crash/SIGKILL mid-render.
  // Runs once when the composition is first built; failures are swallowed.
  void sweepStaleIntermediates(mediaRoot).catch(() => {});
  const progress = new RenderProgressStore();
  const renderEventStore = new SupabaseRenderEventStore(
    createSupabaseServerClient(),
    scope.organizationId,
  );
  const pipeline = new ProductVideoPipeline({
    catalog,
    generateContent: async (snapshot) =>
      (
        await generateVideoScript(provider, snapshot, {
          timeoutMs: environment.runtime.scriptTimeoutMs,
          ...(environment.runtime.scriptModel ? { model: environment.runtime.scriptModel } : {}),
        })
      ).content,
    imageResolver,
    compileStoryboard: compileProductStoryboard,
    renderer,
    library,
    recordEvent: renderEventStore,
  });
  return { catalog, library, pipeline, progress, scope };
}

let composition: ReturnType<typeof compose> | undefined;

export function getComposition() {
  composition ??= compose();
  return composition;
}
