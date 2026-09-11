// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const DEMO_ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  AI_PROVIDER: z.literal("openai-compatible").default("openai-compatible"),
  AI_BASE_URL: z.url().transform((value) => value.replace(/\/+$/, "")),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  ONEVOICE_ORGANIZATION_ID: z.preprocess(
    emptyToUndefined,
    z.string().regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "ONEVOICE_ORGANIZATION_ID must be a canonical UUID",
    ).optional(),
  ),
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
  ONEVOICE_QUEUE_ROOT: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  ONEVOICE_WORKER_ID: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional().transform((value) => value?.trim() || undefined),
  ),
  ONEVOICE_WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  ONEVOICE_JOB_STALE_MS: z.coerce.number().int().positive().default(600_000),
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
  queueRoot?: string;
  worker: {
    workerId?: string;
    pollMs: number;
    jobStaleMs: number;
  };
};

export type ReadServerEnvOptions = Readonly<{
  /** Set when called from the worker entrypoint: ONEVOICE_QUEUE_ROOT becomes required. */
  worker?: boolean;
}>;

export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: ReadServerEnvOptions = {},
): ServerEnv {
  const rawOrganizationId =
    typeof source.ONEVOICE_ORGANIZATION_ID === "string"
      ? source.ONEVOICE_ORGANIZATION_ID.trim()
      : "";
  if (source.NODE_ENV === "production" && rawOrganizationId === "") {
    throw new Error(
      "ONEVOICE_ORGANIZATION_ID is required when NODE_ENV=production " +
        "(the demo default is dev/test only)",
    );
  }

  const rawWorkerId =
    typeof source.ONEVOICE_WORKER_ID === "string" ? source.ONEVOICE_WORKER_ID.trim() : "";
  const rawQueueRoot =
    typeof source.ONEVOICE_QUEUE_ROOT === "string" ? source.ONEVOICE_QUEUE_ROOT.trim() : "";
  if ((options.worker === true || rawWorkerId !== "") && rawQueueRoot === "") {
    throw new Error(
      "ONEVOICE_QUEUE_ROOT is required when running a worker " +
        "(set ONEVOICE_QUEUE_ROOT to the shared file-queue directory)",
    );
  }

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
      organizationId: environment.ONEVOICE_ORGANIZATION_ID ?? DEMO_ORGANIZATION_ID,
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
    queueRoot: environment.ONEVOICE_QUEUE_ROOT,
    worker: {
      workerId: environment.ONEVOICE_WORKER_ID,
      pollMs: environment.ONEVOICE_WORKER_POLL_MS,
      jobStaleMs: environment.ONEVOICE_JOB_STALE_MS,
    },
  };
}
