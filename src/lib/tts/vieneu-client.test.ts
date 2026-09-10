// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TtsClient } from "./vieneu-client";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function scratchFile(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-tts-test-"));
  roots.push(root);
  return path.join(root, "out.mp3");
}

function mp3Response(body = new Uint8Array([1, 2, 3, 4])): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

describe("TtsClient", () => {
  it("writes sidecar mp3 bytes to outPath", async () => {
    const outPath = await scratchFile();
    const seen: string[] = [];
    const client = new TtsClient({
      endpoint: "http://tts:8123/",
      fetchImplementation: (async (input, init) => {
        seen.push(String(input));
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ text: "Xin chào" });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return mp3Response();
      }) as typeof fetch,
    });

    await client.synthesize("Xin chào", outPath);

    expect(seen).toEqual(["http://tts:8123/tts"]);
    expect(await readFile(outPath)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("rejects empty and over-long text without touching fetch", async () => {
    const fetchImplementation = vi.fn(async () => mp3Response());
    const client = new TtsClient({
      endpoint: "http://tts:8123",
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const outPath = await scratchFile();

    await expect(client.synthesize("   ", outPath)).rejects.toThrow("TTS_EMPTY_TEXT");
    await expect(client.synthesize("a".repeat(401), outPath)).rejects.toThrow("TTS_TEXT_TOO_LONG");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("retries 503 then succeeds, and gives up after the 1s/2s/4s ladder", async () => {
    vi.useFakeTimers();
    const outPath = await scratchFile();
    let calls = 0;
    const client = new TtsClient({
      endpoint: "http://tts:8123",
      fetchImplementation: (async () => {
        calls += 1;
        return calls === 1
          ? new Response('{"error":"MODEL_NOT_READY"}', { status: 503 })
          : mp3Response();
      }) as typeof fetch,
    });

    const pending = client.synthesize("Xin chào", outPath);
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(calls).toBe(2);
    expect(await readFile(outPath)).toEqual(Buffer.from([1, 2, 3, 4]));

    calls = 0;
    const failing = new TtsClient({
      endpoint: "http://tts:8123",
      fetchImplementation: (async () => {
        calls += 1;
        return new Response("boom", { status: 500 });
      }) as typeof fetch,
    });
    const outPath2 = await scratchFile();
    const assertion = expect(failing.synthesize("Xin chào", outPath2)).rejects.toThrow(
      "TTS_FAILED: status 500",
    );
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000);
    await assertion;
    expect(calls).toBe(4);
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    const client = new TtsClient({
      endpoint: "http://tts:8123",
      fetchImplementation: (async () => {
        calls += 1;
        return new Response('{"error":"TEXT_TOO_LONG"}', { status: 400 });
      }) as typeof fetch,
    });

    await expect(client.synthesize("Xin chào", await scratchFile())).rejects.toThrow(
      "TTS_FAILED: status 400",
    );
    expect(calls).toBe(1);
  });

  it("honours a pre-aborted external signal", async () => {
    const fetchImplementation = vi.fn(async () => mp3Response());
    const client = new TtsClient({
      endpoint: "http://tts:8123",
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const controller = new AbortController();
    controller.abort(new Error("caller gone"));

    await expect(
      client.synthesize("Xin chào", await scratchFile(), { signal: controller.signal }),
    ).rejects.toThrow("caller gone");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
