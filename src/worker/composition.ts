// SPDX-License-Identifier: Apache-2.0
// Next-free worker composition root (C2). Builds everything the worker needs:
// catalog, library, queue, provider, image resolver, renderer and record
// store. Carries the renderer selection verbatim from composition-root.ts,
// including T7's ONEVOICE_RENDERER rollback flag (N2): the app never
// constructs a renderer. Must never import composition-root.ts or
// "server-only" (guard test enforces by source scan).

import path from "node:path";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { generateVideoScript } from "@/lib/content/generate-video-script";
import { readServerEnv } from "@/lib/env/server";
import { FileJobQueue } from "@/lib/queue/file-queue";
import {
  absoluteRuntimePath,
  buildSharedStores,
  resolveRuntimePaths,
} from "@/lib/render/runtime-composition";
import { resolveExecutablePath } from "@/lib/render/runtime-paths";
import { SupabaseRenderEventStore } from "@/lib/stats/render-event-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TtsClient } from "@/lib/tts/vieneu-client";
import { FfmpegVideoRenderer, sweepStaleIntermediates } from "@/lib/video/ffmpeg-renderer";
import { RemoteImageResolver } from "@/lib/video/remote-image-resolver";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { TemplateVideoRenderer } from "@/lib/video/template-video-renderer";

function defaultWorkerId(): string {
  const host = process.env.HOSTNAME?.trim() || "worker";
  return `${host}-${process.pid}`;
}

export function composeWorker(
  envSource: NodeJS.ProcessEnv = process.env,
  clientFactory: () => ReturnType<typeof createSupabaseServerClient> = createSupabaseServerClient,
) {
  const environment = readServerEnv(envSource);
  const paths = resolveRuntimePaths({
    mediaRoot: environment.runtime.mediaRoot,
    queueRoot: environment.queueRoot,
    ffmpegPath: environment.runtime.ffmpegPath,
    ffprobePath: environment.runtime.ffprobePath,
  });
  const client = clientFactory();
  const scope = { organizationId: environment.runtime.organizationId } as const;
  const { catalog, library } = buildSharedStores({
    paths,
    catalogClient: client,
    defaultOrganizationId: scope.organizationId,
  });
  const provider = new OpenAICompatibleProvider(environment.ai);
  const imageResolver = new RemoteImageResolver({
    allowedHostnames: environment.runtime.imageHosts,
    temporaryRoot: path.join(paths.mediaRoot, ".images"),
    ffmpegPath: paths.ffmpegPath,
    ffprobePath: paths.ffprobePath,
  });
  // Renderer selection for T7's rollback flag — moved verbatim from
  // composition-root.ts (N2). After this split the app never builds a renderer.
  const renderer =
    environment.runtime.renderer === "ffmpeg"
      ? new FfmpegVideoRenderer({
          outputRoot: path.join(paths.mediaRoot, ".output"),
          ffmpegPath: paths.ffmpegPath,
          ffprobePath: paths.ffprobePath,
          fontPath: environment.runtime.fontPath,
        })
      : new TemplateVideoRenderer({
          outputRoot: path.join(paths.mediaRoot, ".output"),
          templatesRoot: absoluteRuntimePath(environment.runtime.templatesRoot),
          audioRoot: absoluteRuntimePath(environment.runtime.audioRoot),
          hyperframesPath: resolveExecutablePath(environment.runtime.hyperframesPath),
          ffmpegPath: paths.ffmpegPath,
          ffprobePath: paths.ffprobePath,
          tts: new TtsClient({
            endpoint: environment.runtime.ttsEndpoint,
            timeoutMs: environment.runtime.ttsTimeoutMs,
          }),
          musicGain: environment.runtime.musicGain,
        });
  void sweepStaleIntermediates(paths.mediaRoot).catch(() => {});
  const recordEvent = new SupabaseRenderEventStore(client, scope.organizationId);
  const scriptOptions = {
    timeoutMs: environment.runtime.scriptTimeoutMs,
    ...(environment.runtime.scriptModel ? { model: environment.runtime.scriptModel } : {}),
  };
  const generateScript =
    environment.runtime.renderer === "ffmpeg"
      ? undefined
      : (snapshot: Parameters<typeof generateVideoScript>[1]) =>
          generateVideoScript(provider, snapshot, scriptOptions);
  // Terminal-failure effect for recoverStale (N12/M1): writes a failed
  // WORKER_LOST manifest so the job is visible on the wire. The queue stays
  // storage-only and never imports the library. WORKER_LOST is a member of
  // errorSchema (rendering_video), so no cast is needed.
  const onJobLost = async (renderId: string): Promise<void> => {
    await library.save(renderId, {
      renderId,
      status: "failed",
      error: { stage: "rendering_video", code: "WORKER_LOST" },
    });
  };
  const queue = new FileJobQueue({ root: paths.queueRoot, onJobLost });
  return {
    catalog,
    library,
    queue,
    provider,
    imageResolver,
    renderer,
    compileStoryboard: compileProductStoryboard,
    generateScript,
    recordEvent,
    scope,
    scriptOptions,
    pollMs: environment.worker.pollMs,
    jobStaleMs: environment.worker.jobStaleMs,
    workerId: environment.worker.workerId ?? defaultWorkerId(),
  };
}

export type WorkerComposition = ReturnType<typeof composeWorker>;
