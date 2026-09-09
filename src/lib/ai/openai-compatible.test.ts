// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { OpenAICompatibleProvider } from "./openai-compatible";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("OpenAICompatibleProvider", () => {
  it("sends each prompt to the Responses API with a fresh session", async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const sessionIds: Array<string | null> = [];
    const methods: Array<string | undefined> = [];
    const authorizations: Array<string | null> = [];
    const contentTypes: Array<string | null> = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      urls.push(String(input));
      bodies.push(JSON.parse(String(init?.body)));
      sessionIds.push(headers.get("x-session-id"));
      methods.push(init?.method);
      authorizations.push(headers.get("authorization"));
      contentTypes.push(headers.get("content-type"));

      return new Response(
        JSON.stringify({
          id: `resp-${urls.length}`,
          model: "muse-spark-1.3-contributor-free",
          output: [
            {
              content: [
                { type: "output_text", text: "Nội dung quảng cáo đã tạo." },
              ],
            },
          ],
          usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://opencode.ai/zen/v1/",
        apiKey: "secret-key",
        model: "muse-spark-1.3-contributor-free",
      },
      fetchImplementation,
    );

    const first = await provider.generateText({ prompt: "Write the campaign." });
    await provider.generateText({ prompt: "Write the campaign." });

    expect(urls).toEqual([
      "https://opencode.ai/zen/v1/responses",
      "https://opencode.ai/zen/v1/responses",
    ]);
    expect(bodies[0]).toEqual({
      model: "muse-spark-1.3-contributor-free",
      input: "Write the campaign.",
    });
    expect(methods).toEqual(["POST", "POST"]);
    expect(authorizations).toEqual(["Bearer secret-key", "Bearer secret-key"]);
    expect(contentTypes).toEqual(["application/json", "application/json"]);
    expect(sessionIds[0]).toMatch(UUID_V4_PATTERN);
    expect(sessionIds[1]).toMatch(UUID_V4_PATTERN);
    expect(sessionIds[0]).not.toBe(sessionIds[1]);
    expect(first).toEqual({
      text: "Nội dung quảng cáo đã tạo.",
      model: "muse-spark-1.3-contributor-free",
      responseId: "resp-1",
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    });
  });

  it("uses top-level output_text when provided", async () => {
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://ai.example.com/v1",
        apiKey: "secret-key",
        model: "configured-model",
      },
      async () =>
        new Response(JSON.stringify({ output_text: "Top-level response" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(provider.generateText({ prompt: "Hello" })).resolves.toEqual({
      text: "Top-level response",
      model: "configured-model",
    });
  });

  it("rejects whitespace-only output", async () => {
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://ai.example.com/v1",
        apiKey: "secret-key",
        model: "configured-model",
      },
      async () =>
        new Response(JSON.stringify({ output_text: "  \n " }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(provider.generateText({ prompt: "Hello" })).rejects.toThrow(
      "AI provider returned no output text",
    );
  });

  it("reports provider status without leaking its response body", async () => {
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://ai.example.com/v1",
        apiKey: "secret-key",
        model: "configured-model",
      },
      async () => new Response("internal provider details", { status: 503 }),
    );

    const request = provider.generateText({ prompt: "Hello" });
    await expect(request).rejects.toThrow(
      "AI provider request failed with status 503",
    );
    await expect(request).rejects.not.toThrow("internal provider details");
  });

  it("forwards the requested timeout through an abort signal", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://ai.example.com/v1",
        apiKey: "secret-key",
        model: "configured-model",
      },
      async (_input, init) => {
        capturedSignal = init?.signal;
        return new Response(JSON.stringify({ output_text: "Timed response" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    await provider.generateText({ prompt: "Hello", timeoutMs: 5 });
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(capturedSignal?.aborted).toBe(true);
  });
});
