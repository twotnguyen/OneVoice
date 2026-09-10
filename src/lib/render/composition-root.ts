// SPDX-License-Identifier: Apache-2.0

import "server-only";

import path from "node:path";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { CatalogRepository } from "@/lib/catalog/repository";
import { generateVideoScript } from "@/lib/content/generate-video-script";
import { readServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TtsClient } from "@/lib/tts/vieneu-client";
import { FfmpegVideoRenderer, sweepStaleIntermediates } from "@/lib/video/ffmpeg-renderer";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";
import { RemoteImageResolver } from "@/lib/video/remote-image-resolver";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { TemplateVideoRenderer } from "@/lib/video/template-video-renderer";
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
  const library = new LocalVideoLibrary(mediaRoot);
  // Best-effort sweep of intermediate artifacts orphaned by a crash/SIGKILL mid-render.
  // Runs once when the composition is first built; failures are swallowed.
  void sweepStaleIntermediates(mediaRoot).catch(() => {});
  const progress = new RenderProgressStore();
  const renderEventStore = new SupabaseRenderEventStore(
    createSupabaseServerClient(),
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
  return { catalog, library, pipeline, progress, scope };
}

let composition: ReturnType<typeof compose> | undefined;

export function getComposition() {
  composition ??= compose();
  return composition;
}
