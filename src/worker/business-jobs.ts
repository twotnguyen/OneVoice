
import { normalizeJobError, type BusinessJobQueue, type BusinessJobHandlers, type JobError } from "../lib/jobs/types";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
 return new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("job_wait_aborted")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
 });
}
// Bounds our wait only; an in-flight database request may still complete remotely.
function bounded<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
 return new Promise((resolve, reject) => {
  const abort = () => { cleanup(); reject(new Error("job_store_wait_aborted")); };
  const timer = setTimeout(() => { cleanup(); reject(new Error("job_store_timeout")); }, 10000);
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) { abort(); return; }
  Promise.resolve().then(operation).then(value => { cleanup(); resolve(value); }, () => { cleanup(); reject(new Error("job_store_failed")); });
 });
}
/** Opt-in pump only: no registered production handlers and no process signal side effects.
 * Handlers must honor AbortSignal and reconcile ambiguous external effects before retrying.
 */
export async function runBusinessJobs(options: { queue: BusinessJobQueue; owner: string; signal: AbortSignal; handlers: BusinessJobHandlers; pollMs?: number; heartbeatMs?: number }): Promise<void> {
 const { queue, owner, signal, handlers } = options;
 const pollMs = options.pollMs ?? 1000;
 const heartbeatMs = options.heartbeatMs ?? 20000;
 if (!Number.isFinite(pollMs) || pollMs < 1 || !Number.isFinite(heartbeatMs) || heartbeatMs < 1 || heartbeatMs > 20000) throw new Error("invalid_job_timing");
 while (!signal.aborted) {
  let job;
  try { job = await bounded(() => queue.claim(owner), signal); } catch { await sleep(pollMs, signal).catch(() => {}); continue; }
  if (!job) { await sleep(pollMs, signal).catch(() => {}); continue; }
  const active = new AbortController();
  const stopHeartbeat = new AbortController();
  const shutdown = () => active.abort();
  signal.addEventListener("abort", shutdown, { once: true });
  if (signal.aborted) active.abort();
  let lost = false;
  const heartbeat = (async () => {
   while (!stopHeartbeat.signal.aborted) {
    try { await sleep(heartbeatMs, stopHeartbeat.signal); } catch { break; }
    try { if (await bounded(() => queue.heartbeat(job), stopHeartbeat.signal)) continue; } catch { if (stopHeartbeat.signal.aborted) break; /* Treat uncertain ownership as lost. */ }
    lost = true; active.abort(); break;
   }
  })();
  let error: JobError | undefined;
  try {
   const handler = handlers[job.kind];
   if (active.signal.aborted) error = "shutdown";
   else if (!handler) error = "unsupported_kind";
   else await handler(job, active.signal);
  } catch (cause) { error = normalizeJobError(cause); }
  finally { stopHeartbeat.abort(); await heartbeat; signal.removeEventListener("abort", shutdown); }
  if (signal.aborted) error = "shutdown";
  if (!lost) { try { await bounded(() => queue.finish(job, error)); } catch { /* Lease expiry recovers uncertain DB writes. */ } }
 }
}
