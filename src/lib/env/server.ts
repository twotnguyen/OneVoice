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
  };
}
