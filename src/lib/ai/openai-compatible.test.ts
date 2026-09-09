// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { OpenAICompatibleProvider } from "./openai-compatible";

describe("OpenAICompatibleProvider", () => {
  it("sends a compatible chat-completions request and returns generated text", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;

      return new Response(
        JSON.stringify({
          model: "provider-model-revision",
          choices: [{ message: { content: "Nội dung quảng cáo đã tạo." } }],
          usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new OpenAICompatibleProvider(
      {
        baseUrl: "https://ai.example.com/v1/",
        apiKey: "secret-key",
        model: "configured-model",
      },
      fetchImplementation,
    );

    const result = await provider.generateText({
      messages: [{ role: "user", content: "Giới thiệu sản phẩm." }],
      temperature: 0.2,
    });

    expect(capturedUrl).toBe("https://ai.example.com/v1/chat/completions");
    expect(capturedInit?.method).toBe("POST");
    expect(new Headers(capturedInit?.headers).get("authorization")).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      model: "configured-model",
      messages: [{ role: "user", content: "Giới thiệu sản phẩm." }],
      temperature: 0.2,
    });
    expect(result).toEqual({
      text: "Nội dung quảng cáo đã tạo.",
      model: "provider-model-revision",
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    });
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

    await expect(
      provider.generateText({ messages: [{ role: "user", content: "Hello" }] }),
    ).rejects.toThrow("AI provider request failed with status 503");
  });
});
