import { describe, expect, it, vi } from "vitest";
import { runBusinessJobs } from "../../worker/business-jobs";
import type { BusinessJob, BusinessJobQueue } from "./types";
const job: BusinessJob = { id: "j", organization_id: "o", kind: "inbound_event", entity_id: "e", lease_owner: "w", lease_token: "t" };
it("aborts active handler on shutdown and releases for bounded retry", async () => {
 const stop = new AbortController();
 const outcomes: unknown[] = [];
 const queue: BusinessJobQueue = { claim: async () => job, heartbeat: async () => true, finish: async (_, error) => { outcomes.push(error); return true; } };
 await runBusinessJobs({ queue, owner: "w", signal: stop.signal, handlers: { inbound_event: async (_, signal) => { stop.abort(); expect(signal.aborted).toBe(true); } } });
 expect(outcomes).toEqual(["shutdown"]);
});
describe("lease ownership", () => {
 it("aborts handler and never completes after heartbeat loses ownership", async () => {
  vi.useFakeTimers();
  const stop = new AbortController();
  const finish = vi.fn(async () => true);
  const running = runBusinessJobs({ queue: { claim: async () => job, heartbeat: async () => false, finish }, owner: "w", signal: stop.signal, heartbeatMs: 10, handlers: { inbound_event: async (_, signal) => { await new Promise<void>(resolve => signal.addEventListener("abort", () => { stop.abort(); resolve(); }, { once: true })); } } });
  await vi.advanceTimersByTimeAsync(10);
  await running;
  expect(finish).not.toHaveBeenCalled();
  vi.useRealTimers();
 });
});
it("aborts handler when a heartbeat RPC never resolves", async () => {
 vi.useFakeTimers();
 const stop = new AbortController();
 const finish = vi.fn(async () => true);
 const running = runBusinessJobs({ queue: { claim: async () => job, heartbeat: () => new Promise(() => {}), finish }, owner: "w", signal: stop.signal, heartbeatMs: 10, handlers: { inbound_event: async (_, signal) => { await new Promise<void>(resolve => signal.addEventListener("abort", () => { stop.abort(); resolve(); }, { once: true })); } } });
 await vi.advanceTimersByTimeAsync(10010);
 await running;
 expect(finish).not.toHaveBeenCalled();
 vi.useRealTimers();
});
it("shutdown stops waiting for a hung heartbeat RPC", async () => {
 vi.useFakeTimers();
 const stop = new AbortController();
 const running = runBusinessJobs({ queue: { claim: async () => job, heartbeat: () => new Promise(() => {}), finish: async () => true }, owner: "w", signal: stop.signal, heartbeatMs: 10, handlers: { inbound_event: async (_, signal) => { await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true })); } } });
 await vi.advanceTimersByTimeAsync(10);
 stop.abort();
 await running;
 vi.useRealTimers();
});
it("shutdown stops waiting for a hung claim", async () => {
 vi.useFakeTimers();
 const stop = new AbortController();
 const running = runBusinessJobs({ queue: { claim: () => new Promise(() => {}), heartbeat: async () => true, finish: async () => true }, owner: "w", signal: stop.signal, handlers: {} });
 await vi.advanceTimersByTimeAsync(1);
 stop.abort();
 await running;
 vi.useRealTimers();
});
it("shutdown bounds a hung completion wait", async () => {
 vi.useFakeTimers();
 const stop = new AbortController();
 const running = runBusinessJobs({ queue: { claim: async () => job, heartbeat: async () => true, finish: () => new Promise(() => {}) }, owner: "w", signal: stop.signal, handlers: { inbound_event: async () => { stop.abort(); } } });
 await vi.advanceTimersByTimeAsync(10000);
 await running;
 vi.useRealTimers();
});
