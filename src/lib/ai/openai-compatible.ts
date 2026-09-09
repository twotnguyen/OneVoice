// SPDX-License-Identifier: Apache-2.0

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

const completionResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

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
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: input.messages,
          ...(input.temperature === undefined
            ? {}
            : { temperature: input.temperature }),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`AI provider request failed with status ${response.status}`);
    }

    const completion = completionResponseSchema.parse(await response.json());
    const usage = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens,
          outputTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;

    return {
      text: completion.choices[0].message.content,
      model: completion.model ?? this.config.model,
      ...(usage ? { usage } : {}),
    };
  }
}
