// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { readServerEnv } from "./server";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SECRET_KEY: "sb_secret_example",
  AI_PROVIDER: "openai-compatible",
  AI_BASE_URL: "https://ai.example.com/v1/",
  AI_API_KEY: "ai-secret-example",
  AI_MODEL: "demo-model",
};

describe("readServerEnv", () => {
  it("returns normalized Supabase and AI server configuration", () => {
    expect(readServerEnv(validEnvironment)).toEqual({
      supabase: {
        url: "https://project.supabase.co",
        publishableKey: "sb_publishable_example",
        secretKey: "sb_secret_example",
      },
      ai: {
        provider: "openai-compatible",
        baseUrl: "https://ai.example.com/v1",
        apiKey: "ai-secret-example",
        model: "demo-model",
      },
    });
  });

  it("does not accept an AI key exposed through NEXT_PUBLIC variables", () => {
    expect(() =>
      readServerEnv({
        ...validEnvironment,
        AI_API_KEY: undefined,
        NEXT_PUBLIC_AI_API_KEY: "public-leak",
      }),
    ).toThrow(/AI_API_KEY/);
  });
});
