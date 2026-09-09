// SPDX-License-Identifier: Apache-2.0

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateTextInput = {
  messages: AiMessage[];
  temperature?: number;
};

export type GenerateTextResult = {
  text: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export interface AiProvider {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}
