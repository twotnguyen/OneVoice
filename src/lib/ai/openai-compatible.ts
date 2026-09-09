// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AiProvider,
  GenerateTextInput,
  GenerateTextResult,
} from "./provider";

type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const responseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  output_text: z.string().optional(),
  output: z
    .array(
      z.object({
        content: z
          .array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function getResponseText(response: z.infer<typeof responseSchema>): string | undefined {
  if (response.output_text?.trim()) return response.output_text;

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text?.trim())
    ?.text;
}

export class OpenAICompatibleProvider implements AiProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly config: OpenAICompatibleConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/responses`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "x-session-id": randomUUID(),
        },
        body: JSON.stringify({
          model: this.config.model,
          input: input.prompt,
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
      },
    );

    if (!response.ok) {
      throw new Error(`AI provider request failed with status ${response.status}`);
    }

    const result = responseSchema.parse(await response.json());
    const text = getResponseText(result);
    if (!text) throw new Error("AI provider returned no output text");

    const usage = result.usage
      ? {
          ...(result.usage.input_tokens === undefined
            ? {}
            : { inputTokens: result.usage.input_tokens }),
          ...(result.usage.output_tokens === undefined
            ? {}
            : { outputTokens: result.usage.output_tokens }),
          ...(result.usage.total_tokens === undefined
            ? {}
            : { totalTokens: result.usage.total_tokens }),
        }
      : undefined;

    return {
      text,
      model: result.model ?? this.config.model,
      ...(result.id ? { responseId: result.id } : {}),
      ...(usage ? { usage } : {}),
    };
  }
}
