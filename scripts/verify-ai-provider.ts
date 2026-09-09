// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";

type ResponsesApiResult = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

function requireEnvironment(name: "AI_BASE_URL" | "AI_API_KEY" | "AI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function responseText(result: ResponsesApiResult): string | undefined {
  if (result.output_text) return result.output_text;

  return result.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)?.text;
}

async function main(): Promise<void> {
  const baseUrl = requireEnvironment("AI_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnvironment("AI_API_KEY");
  const model = requireEnvironment("AI_MODEL");
  const endpoint = baseUrl.endsWith("/responses") ? baseUrl : `${baseUrl}/responses`;
  const startedAt = performance.now();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "x-session-id": randomUUID(),
    },
    body: JSON.stringify({
      model,
      input: "Reply exactly with ONEVOICE_AI_OK",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(
      `AI provider request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`,
    );
  }

  const result = (await response.json()) as ResponsesApiResult;
  const text = responseText(result);
  if (!text) throw new Error("AI provider returned no output text");

  console.log("=== ONEVOICE AI PROVIDER VERIFICATION ===");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`HTTP: ${response.status} ${response.statusText}`);
  console.log(`Model: ${result.model ?? model}`);
  console.log(`Latency: ${latencyMs} ms`);
  if (result.id) console.log(`Response ID: ${result.id}`);
  if (result.usage) {
    console.log(
      `Usage: input=${result.usage.input_tokens ?? "unknown"}, output=${result.usage.output_tokens ?? "unknown"}, total=${result.usage.total_tokens ?? "unknown"}`,
    );
  }
  console.log(`Output: ${text.slice(0, 200)}`);
  console.log("\n>>> AI PROVIDER VERIFICATION PASSED <<<");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`AI provider verification failed: ${message}`);
  process.exitCode = 1;
});
