// SPDX-License-Identifier: Apache-2.0
import type { BusinessJob } from "@/lib/jobs/types";
import type { SourceRecord } from "./sources";
import { ingestSource, type IngestionContent } from "./ingestion";
import type { PublicTextFetcher } from "@/lib/network/public-http";
export interface IngestionWorkerPort {
 load(job: BusinessJob, signal: AbortSignal): Promise<SourceRecord | null>;
 publish(job: BusinessJob, content: IngestionContent, signal?: AbortSignal): Promise<boolean>;
 fail(job: BusinessJob, code: string): Promise<unknown>;
}
const safeErrors = new Set(["unsafe_url", "unsafe_address", "dns_unavailable", "timeout", "aborted", "too_large", "redirect_rejected", "http_error", "unsupported_encoding", "network_error", "unsupported_content", "empty_content", "inactive"]);
export function createIngestionHandler(port: IngestionWorkerPort, fetch?: PublicTextFetcher) {
 return async (job: BusinessJob, signal: AbortSignal): Promise<void> => {
  try {
   const source = await port.load(job, signal); if (!source || signal.aborted) return;
   const content = await ingestSource(source, { signal, fetch });
   if (!signal.aborted) await port.publish(job, content, signal);
  } catch (cause) {
   const code = cause instanceof Error && safeErrors.has(cause.message) ? cause.message : "ingestion_failed";
   await port.fail(job, code).catch(() => {}); throw Error("ingestion_failed");
  }
 };
}
