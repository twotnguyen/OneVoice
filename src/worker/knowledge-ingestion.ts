// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSupabaseDataClient } from "../lib/supabase/server";
import { createIngestionWorkerStore } from "../lib/knowledge/ingestion-repository";
import { createIngestionHandler } from "../lib/knowledge/ingestion-worker";
import { runBusinessJobs } from "./business-jobs";
/** Explicit process opt-in. At most20 due sources per minute, one active fetch per worker. */
export async function runKnowledgeIngestion(signal: AbortSignal) {
 const store = createIngestionWorkerStore(createSupabaseDataClient()); let nextSchedule = 0;
 const queue = { ...store.queue, async claim(owner: string) { if (Date.now() >= nextSchedule) { nextSchedule = Date.now() + 60000; await store.enqueueDue(); } return store.queue.claim(owner); } };
 await runBusinessJobs({ queue, owner: randomUUID(), signal, handlers: { knowledge_ingest: createIngestionHandler(store) }, pollMs: 1000 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (process.env.ONEVOICE_KNOWLEDGE_WORKER !== "1") { console.error("Set ONEVOICE_KNOWLEDGE_WORKER=1 to explicitly enable ingestion."); process.exitCode = 1; }
 else { const stop = new AbortController(); process.once("SIGTERM", () => stop.abort()); process.once("SIGINT", () => stop.abort()); await runKnowledgeIngestion(stop.signal).catch(() => { console.error("knowledge_worker_failed"); process.exitCode = 1; }); }
}
