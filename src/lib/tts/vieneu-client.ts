// SPDX-License-Identifier: Apache-2.0
// HTTP client for the VieNeu-TTS sidecar (services/tts). Contract:
// POST /tts {"text"} -> 200 audio/mpeg | 400 TEXT_EMPTY/TEXT_TOO_LONG |
// 503 MODEL_NOT_READY. Voice is server-side and fixed; the body carries no
// voice field. Concurrency is bounded at the renderer (p-limit), not here.

export type TtsClientOptions = Readonly<{
  endpoint: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}>;

export type TtsSynthOptions = Readonly<{
  /** External abort signal. Combined with the 60 s per-request timeout. */
  signal?: AbortSignal;
}>;

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CHARS = 400;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

function retryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

export class TtsClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: TtsClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  /** POST text to the sidecar and write mp3 bytes to outPath. */
  async synthesize(text: string, outPath: string, options?: TtsSynthOptions): Promise<void> {
    if (!text.trim()) throw new Error("TTS_EMPTY_TEXT");
    if (text.length > MAX_CHARS) throw new Error("TTS_TEXT_TOO_LONG");
    const { writeFile } = await import("node:fs/promises");

    const aborted = (): Error | null =>
      options?.signal?.aborted
        ? ((options.signal.reason as Error | undefined) ?? new Error("TTS_ABORTED"))
        : null;

    let lastError: Error = new Error("TTS_FAILED");
    for (let attempt = 0; ; attempt++) {
      const early = aborted();
      if (early) throw early;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImplementation(`${this.endpoint}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: options?.signal
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal,
        });
        if (response.status === 503) {
          lastError = new Error("TTS_UNAVAILABLE");
        } else if (!response.ok) {
          // No retry on 4xx except 429: a 400 is the client's fault, not the
          // sidecar's — retrying it burns three ladder sleeps for nothing.
          if (!retryableStatus(response.status)) {
            throw new Error(`TTS_FAILED: status ${response.status}`);
          }
          lastError = new Error(`TTS_FAILED: status ${response.status}`);
        } else {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length === 0) throw new Error("TTS_EMPTY_RESPONSE");
          await writeFile(outPath, bytes);
          return;
        }
      } catch (error) {
        const late = aborted();
        if (late) throw late;
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("TTS_TIMEOUT");
        }
        if (error instanceof Error && /^TTS_FAILED: status [45]/.test(error.message)) {
          throw error;
        }
        if (error instanceof Error && error.message === "TTS_EMPTY_RESPONSE") throw error;
        if (error === lastError) {
          // Retryable sidecar failure recorded above; fall through to the
          // ladder sleep below.
        } else {
          throw error instanceof Error ? error : new Error("TTS_FAILED");
        }
      } finally {
        clearTimeout(timer);
      }
      if (attempt >= RETRY_DELAYS_MS.length) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}
