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

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 150;
const ERROR_BODY_LIMIT = 300;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sanitizeErrorBody(body: string, apiKey: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim().slice(0, ERROR_BODY_LIMIT);
  if (!collapsed || !apiKey) return collapsed;
  return collapsed.split(apiKey).join("[REDACTED]");
}

async function readErrorDetail(response: Response, apiKey: string): Promise<string> {
  try {
    const body = await response.text();
    return sanitizeErrorBody(body, apiKey);
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "TimeoutError" || error.name === "AbortError";
  if (error instanceof Error) return error.name === "TimeoutError" || error.name === "AbortError";
  return false;
}

export class OpenAICompatibleProvider implements AiProvider {
  private readonly responsesUrl: string;
  private readonly config: OpenAICompatibleConfig;
  private readonly fetchImplementation: typeof fetch;

  constructor(config: OpenAICompatibleConfig, fetchImplementation: typeof fetch = fetch) {
    this.config = config;
    this.fetchImplementation = fetchImplementation;
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.responsesUrl = baseUrl.endsWith("/responses") ? baseUrl : `${baseUrl}/responses`;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const timeoutMs = input.timeoutMs ?? 30_000;
    const model = input.model ?? this.config.model;
    let lastDetail = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImplementation(this.responsesUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
            "x-session-id": randomUUID(),
          },
          body: JSON.stringify({
            model,
            input: input.prompt,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (isTimeoutError(error)) {
          throw new Error(`AI provider request timed out after ${timeoutMs}ms (TIMEOUT)`, {
            cause: error,
          });
        }
        throw new Error(
          `AI provider request failed (HTTP): ${error instanceof Error ? error.message : "network error"}`,
          { cause: error },
        );
      }

      if (!response.ok) {
        lastDetail = await readErrorDetail(response, this.config.apiKey);
        const retryable = isRetryableStatus(response.status);
        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`AI provider request failed with status ${response.status} (HTTP)`, {
          cause: lastDetail || undefined,
        });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error("AI provider returned invalid response (SCHEMA): body is not JSON", {
          cause: error,
        });
      }

      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("AI provider returned invalid response (SCHEMA): schema mismatch", {
          cause: parsed.error,
        });
      }

      const text = getResponseText(parsed.data);
      if (!text) throw new Error("AI provider returned no output text");

      const usage = parsed.data.usage
        ? {
            ...(parsed.data.usage.input_tokens === undefined
              ? {}
              : { inputTokens: parsed.data.usage.input_tokens }),
            ...(parsed.data.usage.output_tokens === undefined
              ? {}
              : { outputTokens: parsed.data.usage.output_tokens }),
            ...(parsed.data.usage.total_tokens === undefined
              ? {}
              : { totalTokens: parsed.data.usage.total_tokens }),
          }
        : undefined;

      return {
        text,
        model: parsed.data.model ?? this.config.model,
        ...(parsed.data.id ? { responseId: parsed.data.id } : {}),
        ...(usage ? { usage } : {}),
      };
    }

    throw new Error("AI provider request failed (HTTP): retries exhausted", {
      cause: lastDetail || undefined,
    });
  }
}
