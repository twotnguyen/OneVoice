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
      runtime: {
        organizationId: "a0000000-0000-0000-0000-000000000001",
        mediaRoot: "renders",
        imageHosts: ["product.hstatic.net"],
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        hyperframesPath: "hyperframes",
        fontPath: undefined,
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

  it("applies local video runtime defaults", () => {
    expect(readServerEnv(validEnvironment).runtime).toEqual({
      organizationId: "a0000000-0000-0000-0000-000000000001",
      mediaRoot: "renders",
      imageHosts: ["product.hstatic.net"],
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      hyperframesPath: "hyperframes",
      fontPath: undefined,
    });
  });

  it("parses configured image hosts and rejects an empty allow-list", () => {
    expect(readServerEnv({
      ...validEnvironment,
      ONEVOICE_IMAGE_HOSTS: "cdn.example.com, product.hstatic.net ",
    }).runtime.imageHosts).toEqual(["cdn.example.com", "product.hstatic.net"]);

    expect(() => readServerEnv({
      ...validEnvironment,
      ONEVOICE_IMAGE_HOSTS: " , ",
    })).toThrow(/ONEVOICE_IMAGE_HOSTS/);
  });

  it("validates the configured organization identifier", () => {
    expect(() => readServerEnv({
      ...validEnvironment,
      ONEVOICE_ORGANIZATION_ID: "not-a-uuid",
    })).toThrow(/ONEVOICE_ORGANIZATION_ID/);
  });

  it("accepts the explicitly configured canonical demo organization ID", () => {
    expect(readServerEnv({
      ...validEnvironment,
      ONEVOICE_ORGANIZATION_ID: "a0000000-0000-0000-0000-000000000001",
    }).runtime.organizationId).toBe("a0000000-0000-0000-0000-000000000001");
  });
});
