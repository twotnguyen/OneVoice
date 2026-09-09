// SPDX-License-Identifier: Apache-2.0

import "server-only";

import path from "node:path";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { CatalogRepository } from "@/lib/catalog/repository";
import { generateProductContent } from "@/lib/content/generate-product-content";
import { readServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FfmpegVideoRenderer } from "@/lib/video/ffmpeg-renderer";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";
import { RemoteImageResolver } from "@/lib/video/remote-image-resolver";
import { compileProductStoryboard } from "@/lib/video/storyboard";
import { ProductVideoPipeline } from "./product-video-pipeline";

function absoluteRuntimePath(value: string): string {
  return path.isAbsolute(value)
    ? value
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), value);
}

function compose() {
  const environment = readServerEnv();
  const mediaRoot = absoluteRuntimePath(environment.runtime.mediaRoot);
  const scope = { organizationId: environment.runtime.organizationId } as const;
  const catalog = new CatalogRepository({
    client: createSupabaseServerClient(),
    defaultOrganizationId: scope.organizationId,
  });
  const provider = new OpenAICompatibleProvider(environment.ai);
  const imageResolver = new RemoteImageResolver({
    allowedHostnames: environment.runtime.imageHosts,
    temporaryRoot: path.join(mediaRoot, ".images"),
    ffmpegPath: environment.runtime.ffmpegPath,
    ffprobePath: environment.runtime.ffprobePath,
  });
  const renderer = new FfmpegVideoRenderer({
    outputRoot: path.join(mediaRoot, ".output"),
    ffmpegPath: environment.runtime.ffmpegPath,
    ffprobePath: environment.runtime.ffprobePath,
    fontPath: environment.runtime.fontPath,
  });
  const library = new LocalVideoLibrary(mediaRoot);
  const pipeline = new ProductVideoPipeline({
    catalog,
    generateContent: (snapshot) => generateProductContent(provider, snapshot),
    imageResolver,
    compileStoryboard: compileProductStoryboard,
    renderer,
    library,
  });
  return { catalog, library, pipeline, scope };
}

let composition: ReturnType<typeof compose> | undefined;

export function getComposition() {
  composition ??= compose();
  return composition;
}
