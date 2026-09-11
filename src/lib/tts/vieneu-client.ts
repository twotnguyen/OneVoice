// SPDX-License-Identifier: Apache-2.0
// HTTP client for the VieNeu-TTS sidecar (services/tts). Contract:
// POST /tts {"text"} -> 200 audio/mpeg | 400 TEXT_EMPTY/TEXT_TOO_LONG |
// 429 TTS_BUSY | 503 MODEL_NOT_READY. Voice is server-side and fixed; the
// body carries no voice field. Concurrency is bounded at the renderer
// (p-limit), not here.
//
// Retry policy: retryable HTTP statuses (429/503/5xx) AND network-level
// fetch rejections (ECONNREFUSED, DNS, timeouts) go through the 1s/2s/4s
// ladder. timeoutMs is the TOTAL budget for one synthesize() call —
// attempts plus ladder sleeps — so a hanging sidecar fails fast instead of
// stacking per-attempt timeouts. Must stay above the server's ffmpeg
// subprocess timeout (services/tts TTS_FFMPEG_TIMEOUT_S, 50 s by default).

export type TtsClientOptions = Readonly<{
  endpoint: string;
  timeoutMs?: number;
  /** Must match the sidecar's TTS_MAX_CHARS (both default 400). */
  maxChars?: number;
  fetchImplementation?: typeof fetch;
}>;

export type TtsSynthOptions = Readonly<{
  /** External abort signal. Combined with the total timeoutMs budget. */
  signal?: AbortSignal;
}>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CHARS = 400;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

// Node runtime errno values seen when the sidecar is down, unreachable, or
// drops the connection. Undici surfaces these as the `cause` of a
// TypeError("fetch failed"); other fetch implementations may put `code`
// directly on the error.
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function retryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const direct = (error as NodeJS.ErrnoException).code;
  const viaCause = (error.cause as { code?: unknown } | undefined)?.code;
  const code = typeof direct === "string" ? direct : viaCause;
  if (typeof code === "string" && NETWORK_CODES.has(code)) return true;
  // Undici/node fetch rejects with a plain TypeError("fetch failed") for
  // network failures; disk errors from writeFile carry string codes instead.
  return error instanceof TypeError;
}

export class TtsClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxChars: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: TtsClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  /** POST text to the sidecar and write mp3 bytes to outPath. */
  async synthesize(text: string, outPath: string, options?: TtsSynthOptions): Promise<void> {
    if (!text.trim()) throw new Error("TTS_EMPTY_TEXT");
    if (text.length > this.maxChars) throw new Error("TTS_TEXT_TOO_LONG");
    const { writeFile } = await import("node:fs/promises");

    const aborted = (): Error | null =>
      options?.signal?.aborted
        ? ((options.signal.reason as Error | undefined) ?? new Error("TTS_ABORTED"))
        : null;

    const startedAt = Date.now();
    let lastError: Error = new Error("TTS_FAILED");
    for (let attempt = 0; ; attempt++) {
      const early = aborted();
      if (early) throw early;
      const remainingMs = this.timeoutMs - (Date.now() - startedAt);
      // Total budget exhausted: fail fast instead of starting another
      // attempt (or sleep) that cannot finish in time.
      if (remainingMs <= 0) throw lastError;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, remainingMs));
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
        // Network-level fetch rejection (sidecar down, DNS, timeout): retry
        // through the ladder like a retryable status. Anything else (disk
        // errors from writeFile, programmer errors) throws immediately.
        if (!isNetworkError(error)) {
          throw error instanceof Error ? error : new Error("TTS_FAILED");
        }
        lastError = error instanceof Error ? error : new Error("TTS_FAILED");
      } finally {
        clearTimeout(timer);
      }
      if (attempt >= RETRY_DELAYS_MS.length) throw lastError;
      const delayMs = RETRY_DELAYS_MS[attempt];
      // No room left in the total budget for the sleep plus another attempt.
      if (Date.now() - startedAt + delayMs >= this.timeoutMs) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
