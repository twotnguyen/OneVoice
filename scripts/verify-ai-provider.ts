// SPDX-License-Identifier: Apache-2.0

import { OpenAICompatibleProvider } from "../src/lib/ai/openai-compatible.ts";

const EXPECTED_MARKER = "ONEVOICE_AI_OK";
const DEFAULT_TIMEOUT_MS = 30_000;

function requireEnvironment(name: "AI_BASE_URL" | "AI_API_KEY" | "AI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readTimeoutMs(): number {
  const raw = process.env.AI_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("AI_TIMEOUT_MS must be a positive integer");
  }
  return parsed;
}

async function main(): Promise<void> {
  const baseUrl = requireEnvironment("AI_BASE_URL");
  const apiKey = requireEnvironment("AI_API_KEY");
  const model = requireEnvironment("AI_MODEL");
  const timeoutMs = readTimeoutMs();
  const provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model });
  const endpoint = baseUrl.replace(/\/+$/, "").endsWith("/responses")
    ? baseUrl.replace(/\/+$/, "")
    : `${baseUrl.replace(/\/+$/, "")}/responses`;
  const startedAt = performance.now();

  const result = await provider.generateText({
    prompt: `Reply exactly with ${EXPECTED_MARKER}`,
    timeoutMs,
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (!result.text.includes(EXPECTED_MARKER)) {
    throw new Error(`AI provider verification failed: output missing ${EXPECTED_MARKER}`);
  }

  console.log("=== ONEVOICE AI PROVIDER VERIFICATION ===");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${result.model}`);
  console.log(`Latency: ${latencyMs} ms`);
  if (result.responseId) console.log(`Response ID: ${result.responseId}`);
  if (result.usage) {
    console.log(
      `Usage: input=${result.usage.inputTokens ?? "unknown"}, output=${result.usage.outputTokens ?? "unknown"}, total=${result.usage.totalTokens ?? "unknown"}`,
    );
  }
  console.log(`Output: ${result.text.slice(0, 200)}`);
  console.log("\n>>> AI PROVIDER VERIFICATION PASSED <<<");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`AI provider verification failed: ${message}`);
  process.exitCode = 1;
});
