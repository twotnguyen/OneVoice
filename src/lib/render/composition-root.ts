// SPDX-License-Identifier: Apache-2.0

import "server-only";

import path from "node:path";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { generateVideoScript } from "@/lib/content/generate-video-script";
import { readServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TtsClient } from "@/lib/tts/vieneu-client";
import { FfmpegVideoRenderer, sweepStaleIntermediates } from "@/lib/video/ffmpeg-renderer";
import { RemoteImageResolver } from "@/lib/video/remote-image-resolver";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { TemplateVideoRenderer } from "@/lib/video/template-video-renderer";
import { SupabaseRenderEventStore } from "@/lib/stats/render-event-store";
import { ProductVideoPipeline } from "./product-video-pipeline";
import { RenderProgressStore } from "./progress-store";
import { absoluteRuntimePath, buildSharedStores, resolveRuntimePaths } from "./runtime-composition";
import { resolveExecutablePath } from "./runtime-paths";

// App-side composition root. T8 adds the shared queue exposure (enqueue path);
// the pipeline/progress construction stays until T10 rewires the routes, at
// which point this becomes enqueue-only { catalog, library, queue, scope }.
// The renderer selection block below is the verbatim source N2 carries into
// src/worker/composition.ts.
function compose() {
  const environment = readServerEnv();
  const paths = resolveRuntimePaths({
    mediaRoot: environment.runtime.mediaRoot,
    queueRoot: environment.queueRoot,
    ffmpegPath: environment.runtime.ffmpegPath,
    ffprobePath: environment.runtime.ffprobePath,
  });
  const mediaRoot = paths.mediaRoot;
  const ffmpegPath = paths.ffmpegPath;
  const ffprobePath = paths.ffprobePath;
  const scope = { organizationId: environment.runtime.organizationId } as const;
  const client = createSupabaseServerClient();
  const { catalog, library, queue } = buildSharedStores({
    paths,
    catalogClient: client,
    defaultOrganizationId: scope.organizationId,
  });
  const provider = new OpenAICompatibleProvider(environment.ai);
  const imageResolver = new RemoteImageResolver({
    allowedHostnames: environment.runtime.imageHosts,
    temporaryRoot: path.join(mediaRoot, ".images"),
    ffmpegPath,
    ffprobePath,
  });
  // Renderer selection for T7's rollback flag. Isolated in one expression so
  // T8 can move it verbatim into src/worker/composition.ts.
  const renderer =
    environment.runtime.renderer === "ffmpeg"
      ? new FfmpegVideoRenderer({
          outputRoot: path.join(mediaRoot, ".output"),
          ffmpegPath,
          ffprobePath,
          fontPath: environment.runtime.fontPath,
        })
      : new TemplateVideoRenderer({
          outputRoot: path.join(mediaRoot, ".output"),
          templatesRoot: absoluteRuntimePath(environment.runtime.templatesRoot),
          audioRoot: absoluteRuntimePath(environment.runtime.audioRoot),
          hyperframesPath: resolveExecutablePath(environment.runtime.hyperframesPath),
          ffmpegPath,
          ffprobePath,
          tts: new TtsClient({
            endpoint: environment.runtime.ttsEndpoint,
            timeoutMs: environment.runtime.ttsTimeoutMs,
          }),
          musicGain: environment.runtime.musicGain,
        });
  // Best-effort sweep of intermediate artifacts orphaned by a crash/SIGKILL mid-render.
  // Runs once when the composition is first built; failures are swallowed.
  void sweepStaleIntermediates(mediaRoot).catch(() => {});
  const progress = new RenderProgressStore();
  const renderEventStore = new SupabaseRenderEventStore(
    client,
    scope.organizationId,
  );
  const scriptOptions = {
    timeoutMs: environment.runtime.scriptTimeoutMs,
    ...(environment.runtime.scriptModel ? { model: environment.runtime.scriptModel } : {}),
  };
  const generateScript =
    environment.runtime.renderer === "ffmpeg"
      ? undefined
      : (snapshot: Parameters<typeof generateVideoScript>[1]) =>
          generateVideoScript(provider, snapshot, scriptOptions);
  const pipeline = new ProductVideoPipeline({
    catalog,
    generateContent: async (snapshot) =>
      (await generateVideoScript(provider, snapshot, scriptOptions)).content,
    ...(generateScript ? { generateScript } : {}),
    imageResolver,
    compileStoryboard: compileProductStoryboard,
    renderer,
    library,
    recordEvent: renderEventStore,
  });
  return { catalog, library, pipeline, progress, queue, scope };
}

let composition: ReturnType<typeof compose> | undefined;

export function getComposition() {
  composition ??= compose();
  return composition;
}
