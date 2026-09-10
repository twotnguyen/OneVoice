// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  AI_PROVIDER: z.literal("openai-compatible").default("openai-compatible"),
  AI_BASE_URL: z.url().transform((value) => value.replace(/\/+$/, "")),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  ONEVOICE_ORGANIZATION_ID: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "ONEVOICE_ORGANIZATION_ID must be a canonical UUID",
  ).default("a0000000-0000-0000-0000-000000000001"),
  ONEVOICE_MEDIA_ROOT: z.string().min(1).default("renders"),
  ONEVOICE_IMAGE_HOSTS: z.string().default("product.hstatic.net").transform((value, context) => {
    const hosts = value.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (hosts.length === 0) {
      context.addIssue({ code: "custom", message: "ONEVOICE_IMAGE_HOSTS must not be empty" });
      return z.NEVER;
    }
    return hosts;
  }),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  ONEVOICE_HYPERFRAMES_PATH: z.string().min(1).default("hyperframes"),
  ONEVOICE_FONT_PATH: z.string().optional().transform((value) => value?.trim() || undefined),
  ONEVOICE_SCRIPT_MODEL: z.string().optional().transform((value) => value?.trim() || undefined),
  ONEVOICE_SCRIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  ONEVOICE_RENDERER: z.enum(["template", "ffmpeg"]).default("template"),
  ONEVOICE_TTS_ENDPOINT: z.string().min(1).default("http://localhost:8123"),
  ONEVOICE_TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  ONEVOICE_MUSIC_GAIN: z.coerce.number().min(0).max(1).default(0.35),
  ONEVOICE_TEMPLATES_ROOT: z.string().min(1).default("src/lib/video/template-pipeline/templates"),
  ONEVOICE_AUDIO_ROOT: z.string().min(1).default("assets/audio"),
});

export type ServerEnv = {
  supabase: {
    url: string;
    publishableKey: string;
    secretKey: string;
  };
  ai: {
    provider: "openai-compatible";
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  runtime: {
    organizationId: string;
    mediaRoot: string;
    imageHosts: string[];
    ffmpegPath: string;
    ffprobePath: string;
    hyperframesPath: string;
    fontPath?: string;
    scriptModel?: string;
    scriptTimeoutMs: number;
    renderer: "template" | "ffmpeg";
    ttsEndpoint: string;
    ttsTimeoutMs: number;
    musicGain: number;
    templatesRoot: string;
    audioRoot: string;
  };
};

export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const environment = serverEnvironmentSchema.parse(source);

  return {
    supabase: {
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      secretKey: environment.SUPABASE_SECRET_KEY,
    },
    ai: {
      provider: environment.AI_PROVIDER,
      baseUrl: environment.AI_BASE_URL,
      apiKey: environment.AI_API_KEY,
      model: environment.AI_MODEL,
    },
    runtime: {
      organizationId: environment.ONEVOICE_ORGANIZATION_ID,
      mediaRoot: environment.ONEVOICE_MEDIA_ROOT,
      imageHosts: environment.ONEVOICE_IMAGE_HOSTS,
      ffmpegPath: environment.FFMPEG_PATH,
      ffprobePath: environment.FFPROBE_PATH,
      hyperframesPath: environment.ONEVOICE_HYPERFRAMES_PATH,
      fontPath: environment.ONEVOICE_FONT_PATH,
      scriptModel: environment.ONEVOICE_SCRIPT_MODEL,
      scriptTimeoutMs: environment.ONEVOICE_SCRIPT_TIMEOUT_MS,
      renderer: environment.ONEVOICE_RENDERER,
      ttsEndpoint: environment.ONEVOICE_TTS_ENDPOINT,
      ttsTimeoutMs: environment.ONEVOICE_TTS_TIMEOUT_MS,
      musicGain: environment.ONEVOICE_MUSIC_GAIN,
      templatesRoot: environment.ONEVOICE_TEMPLATES_ROOT,
      audioRoot: environment.ONEVOICE_AUDIO_ROOT,
    },
  };
}
