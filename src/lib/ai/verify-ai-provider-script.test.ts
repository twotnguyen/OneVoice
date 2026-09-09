// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

function runVerifier(environment: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", "scripts/verify-ai-provider.ts"],
        {
          cwd: process.cwd(),
          env: environment,
        },
      );
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}

describe("AI provider verifier", () => {
  it("calls the Responses API with env credentials without printing the API key", async () => {
    const apiKey = "opencode-test-secret";
    let observedRequest: {
      method?: string;
      path?: string;
      authorization?: string;
      sessionId?: string;
      body?: unknown;
    } = {};
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        observedRequest = {
          method: request.method,
          path: request.url,
          authorization: request.headers.authorization,
          sessionId: request.headers["x-session-id"] as string | undefined,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: "resp_test",
            object: "response",
            status: "completed",
            model: "muse-spark-1.3-contributor-free",
            output: [
              {
                id: "msg_test",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: "ONEVOICE_AI_OK",
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 7,
              output_tokens: 3,
              total_tokens: 10,
            },
          }),
        );
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");

    const result = await runVerifier({
      ...process.env,
      AI_BASE_URL: `http://127.0.0.1:${address.port}`,
      AI_API_KEY: apiKey,
      AI_MODEL: "muse-spark-1.3-contributor-free",
    });

    expect(result.code).toBe(0);
    expect(observedRequest).toMatchObject({
      method: "POST",
      path: "/responses",
      authorization: `Bearer ${apiKey}`,
      body: {
        model: "muse-spark-1.3-contributor-free",
        input: "Reply exactly with ONEVOICE_AI_OK",
      },
    });
    expect(observedRequest.body).toEqual({
      model: "muse-spark-1.3-contributor-free",
      input: "Reply exactly with ONEVOICE_AI_OK",
    });
    expect(observedRequest.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.stdout).toContain("ONEVOICE_AI_OK");
    expect(result.stdout).toContain("muse-spark-1.3-contributor-free");
    expect(result.stdout).not.toContain(apiKey);
    expect(result.stderr).not.toContain(apiKey);
  });
});
