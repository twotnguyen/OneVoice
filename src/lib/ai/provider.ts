// SPDX-License-Identifier: Apache-2.0

export type GenerateTextInput = {
  prompt: string;
  timeoutMs?: number;
  model?: string;
  signal?: AbortSignal;
};

export type GenerateTextResult = {
  text: string;
  model: string;
  responseId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export interface AiProvider {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}
