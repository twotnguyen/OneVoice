// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { fetchPublicText, type PublicTextFetcher } from "@/lib/network/public-http";
import { sourceDocumentSchema, type SourceRecord } from "./sources";
export type IngestionContent = { hash: string; chunks: string[]; finalUrl: string | null; contentType: string };
/** Extract text only; never execute scripts, load resources or turn source prose into instructions. */
function htmlText(html: string, signal?: AbortSignal): Promise<string> {
 return new Promise((resolve, reject) => {
  const path = import.meta.url.endsWith(".ts") ? new URL("./ingestion-parser.ts", import.meta.url) : new URL("./knowledge-parser.js", import.meta.url);
  const worker = new Worker(path, { workerData: html, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 }, execArgv: [] });
  let settled = false;
  const finish = (text?: string, error?: string) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); void worker.terminate(); if (error) reject(Error(error)); else resolve(text!); };
  const abort = () => finish(undefined, "aborted");
  const timer = setTimeout(() => finish(undefined, "too_large"), 1500);
  signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  worker.once("message", (result: { text?: string; error?: string }) => finish(result.text, typeof result.text === "string" ? undefined : "too_large"));
  worker.once("error", () => finish(undefined, "too_large")); worker.once("exit", () => { if (!settled) finish(undefined, "too_large"); });
 });
}
export async function ingestSource(source: SourceRecord, options: { signal?: AbortSignal; fetch?: PublicTextFetcher } = {}): Promise<IngestionContent> {
 if (options.signal?.aborted) throw Error("aborted");
 const document = sourceDocumentSchema.parse(source.document); if (!document.active) throw Error("inactive");
 let content = document.text ?? "", finalUrl: string | null = null, contentType = "text/plain";
 if (document.kind === "html") {
  const result = await (options.fetch ?? fetchPublicText)(document.url!, { signal: options.signal, maxBytes: 524288, timeoutMs: 8000 });
  if (Buffer.byteLength(result.text, "utf8") > 524288) throw Error("too_large");
  const mime = result.contentType.split(";")[0].trim().toLowerCase();
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(result.contentType)?.[1].toLowerCase();
  if (!["text/html", "text/plain"].includes(mime) || (charset && !["utf-8", "utf8", "us-ascii"].includes(charset))) throw Error("unsupported_content");
  content = mime === "text/html" ? await htmlText(result.text, options.signal) : result.text; finalUrl = result.finalUrl; contentType = mime;
 }
 if (options.signal?.aborted) throw Error("aborted");
 const normalized = content.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/gu, " ").trim();
 if (!normalized) throw Error("empty_content");
 if (normalized.length > 200000) throw Error("too_large");
 const chunks: string[] = [];
 for (let offset = 0; offset < normalized.length;) {
  let end = Math.min(offset + 2000, normalized.length);
  if (end < normalized.length && /[\uD800-\uDBFF]/.test(normalized[end - 1])) end--;
  chunks.push(normalized.slice(offset, end)); offset = end;
 }
 if (chunks.length > 100) throw Error("too_large");
 return { hash: createHash("sha256").update(normalized).digest("hex"), chunks, finalUrl, contentType };
}
