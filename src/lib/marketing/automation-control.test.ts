// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { pauseAutomation, resumeAutomation, requestPriority, completePriority, failPriority, canPublishMarketingJob, parseAutomationModes } from "./automation-control";

const manager = { id: "manager-1", role: "manager" };
const running = Object.freeze({ status: "RUNNING", priorityId: null });
const paused = Object.freeze({ status: "PAUSED", priorityId: null });
const priority = Object.freeze({ status: "PAUSED", priorityId: "priority-1" });

describe("marketing automation control", () => {
  it.each([null, {}, { id: "staff-1", role: "staff" }, { id: "", role: "manager" }, { id: "x", role: "admin" }])("rejects unauthorized management: %j", (actor) => {
    expect(() => pauseAutomation(running, actor)).toThrow("FORBIDDEN");
    expect(() => resumeAutomation(paused, actor)).toThrow("FORBIDDEN");
    expect(() => requestPriority(running, actor, "priority-1")).toThrow("FORBIDDEN");
    expect(() => requestPriority(priority, actor, "priority-1")).toThrow("FORBIDDEN");
  });
  it("pauses and only explicitly resumes with a manager", () => {
    expect(pauseAutomation(running, manager)).toEqual(paused);
    expect(pauseAutomation(priority, manager)).toEqual(priority);
    expect(resumeAutomation(paused, manager)).toEqual(running);
    expect(resumeAutomation(running, manager)).toEqual(running);
    expect(() => resumeAutomation(priority, manager)).toThrow("PRIORITY_IN_PROGRESS");
  });
  it("forces pause for priority requests from either status", () => {
    expect(requestPriority(running, manager, "priority-1")).toEqual(priority);
    expect(requestPriority(paused, manager, "priority-1")).toEqual(priority);
  });
  it("deduplicates the active ID and rejects a conflicting ID", () => {
    expect(requestPriority(priority, manager, "priority-1")).toEqual(priority);
    expect(() => requestPriority(priority, manager, "priority-2")).toThrow("PRIORITY_CONFLICT");
  });
  it.each([completePriority, failPriority])("terminal events clear only their matching ID and never resume", (finish) => {
    expect(finish(priority, "priority-1")).toEqual(paused);
    expect(() => finish(priority, "priority-2")).toThrow("PRIORITY_MISMATCH");
    expect(() => finish(paused, "priority-1")).toThrow("PRIORITY_MISMATCH");
    expect(() => finish(running, "priority-1")).toThrow("PRIORITY_MISMATCH");
    expect(canPublishMarketingJob(finish(priority, "priority-1"), { kind: "priority", priorityId: "priority-1" })).toBe(false);
  });
  it.each([null, "", "  ", 7])("rejects invalid priority IDs: %j", (id) => {
    expect(() => requestPriority(running, manager, id)).toThrow("INVALID_PRIORITY_ID");
    expect(() => completePriority(priority, id)).toThrow("INVALID_PRIORITY_ID");
    expect(() => failPriority(priority, id)).toThrow("INVALID_PRIORITY_ID");
  });
  it.each([null, {}, { status: "RUNNING", priorityId: "priority-1" }, { status: "PAUSED" }, { status: "PAUSED", priorityId: " " }, { status: "OTHER", priorityId: null }])("fails closed on invalid state: %j", (state) => {
    expect(() => pauseAutomation(state, manager)).toThrow("INVALID_STATE");
    expect(() => resumeAutomation(state, manager)).toThrow("INVALID_STATE");
    expect(() => requestPriority(state, manager, "priority-1")).toThrow("INVALID_STATE");
    expect(() => completePriority(state, "priority-1")).toThrow("INVALID_STATE");
    expect(() => failPriority(state, "priority-1")).toThrow("INVALID_STATE");
    expect(canPublishMarketingJob(state, { kind: "ordinary" })).toBe(false);
    expect(canPublishMarketingJob(state, { kind: "priority", priorityId: "priority-1" })).toBe(false);
  });
  it("returns frozen independent snapshots without mutating its inputs", () => {
    const original = { status: "RUNNING", priorityId: null, extra: "discard" };
    const result = requestPriority(original, manager, "priority-1");
    expect(original).toEqual({ status: "RUNNING", priorityId: null, extra: "discard" });
    expect(result).toEqual(priority);
    expect(Object.isFrozen(result)).toBe(true);
    expect(pauseAutomation(paused, manager)).not.toBe(paused);
  });
  it.each([
    [running, { kind: "ordinary" }, true],
    [paused, { kind: "ordinary" }, false],
    [priority, { kind: "ordinary", priorityId: "priority-1" }, false],
    [priority, { kind: "priority", priorityId: "priority-1" }, true],
    [priority, { kind: "priority", priorityId: "priority-2" }, false],
    [priority, { kind: "priority" }, false],
    [paused, { kind: "priority", priorityId: "priority-1" }, false],
    [running, { kind: "priority", priorityId: "priority-1" }, false],
    [running, { kind: "ordinary", priorityId: "priority-1" }, false],
    [running, { kind: "unknown" }, false],
    [running, null, false],
  ])("checks publish eligibility: %j %j -> %j", (state, job, allowed) => {
    expect(canPublishMarketingJob(state, job)).toBe(allowed);
  });
});

describe("independent automation modes", () => {
  it.each([
    { goalSelection: "auto", timing: "auto" },
    { goalSelection: "auto", timing: "constrained" },
    { goalSelection: "manager", timing: "auto" },
    { goalSelection: "manager", timing: "constrained" },
  ])("allows each independent choice: %j", (modes) => {
    const result = parseAutomationModes(modes);
    expect(result).toEqual(modes);
    expect(result).not.toBe(modes);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([null, {}, { goalSelection: "constrained", timing: "auto" }, { goalSelection: "auto", timing: "manager" }])("rejects invalid modes: %j", (modes) => {
    expect(() => parseAutomationModes(modes)).toThrow("INVALID_MODES");
  });
});
