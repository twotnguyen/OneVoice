// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { canAiRespond, claimHandoff, completeHandoff, requestHandoff, type HandoffState } from "./handoff";

const active: HandoffState = { status: "AI_ACTIVE", reason: null, claimedBy: null };
const waiting: HandoffState = { status: "WAITING_STAFF", reason: "return_request", claimedBy: null };
const claimed: HandoffState = { status: "STAFF_ACTIVE", reason: "return_request", claimedBy: "staff-1" };
const staff = { id: "staff-1", role: "staff" };
const manager = { id: "manager-1", role: "manager" };

describe("handoff", () => {
  it.each(["return_request", "warranty_request", "customer_requested", "missing_evidence", "lookup_failed"] as const)("pauses AI immediately for %s", (reason) => {
    const next = requestHandoff(active, reason);
    expect(next).toEqual({ status: "WAITING_STAFF", reason, claimedBy: null });
    expect(canAiRespond(next)).toBe(false);
  });
  it("answers policy questions without requesting a handoff", () => {
    expect(requestHandoff(active, "policy_question")).toEqual(active);
    expect(canAiRespond(active)).toBe(true);
  });
  it.each([waiting, claimed])("keeps requests idempotent while $status", (state) => {
    for (const reason of ["return_request", "warranty_request", "customer_requested", "missing_evidence", "lookup_failed", "policy_question"] as const) {
      expect(requestHandoff(state, reason)).toEqual(state);
    }
    expect(canAiRespond(state)).toBe(false);
  });
  it.each([staff, manager])("allows $role to claim a waiting request", (actor) => {
    expect(claimHandoff(waiting, actor)).toEqual({ ...claimed, claimedBy: actor.id });
  });
  it("does not transfer ownership on repeat claims", () => {
    expect(claimHandoff(claimed, staff)).toEqual(claimed);
    expect(() => claimHandoff(claimed, { id: "staff-2", role: "staff" })).toThrow(expect.objectContaining({ code: "ALREADY_CLAIMED" }));
    expect(() => claimHandoff(claimed, manager)).toThrow(expect.objectContaining({ code: "ALREADY_CLAIMED" }));
  });
  it.each([staff, manager])("allows completion by claimant or manager ($role)", (actor) => {
    const next = completeHandoff(claimed, actor);
    expect(next).toEqual(active);
    expect(canAiRespond(next)).toBe(true);
  });
  it("denies a different staff member completion", () => {
    expect(() => completeHandoff(claimed, { id: "staff-2", role: "staff" })).toThrow(expect.objectContaining({ code: "NOT_CLAIMANT" }));
  });
  it.each([active, waiting])("cannot complete $status even as manager", (state) => {
    expect(() => completeHandoff(state, manager)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });
  it("cannot claim an AI conversation", () => {
    expect(() => claimHandoff(active, staff)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });
  it.each([{ id: "", role: "staff" }, { id: "  ", role: "manager" }, { id: "staff-1", role: "owner" }, { id: "staff-1", role: null }, null])("denies invalid actors %j", (actor) => {
    expect(() => claimHandoff(waiting, actor)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => completeHandoff(claimed, actor)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });
  it("rejects unrecognized request reasons", () => {
    expect(() => requestHandoff(active, "unknown")).toThrow(expect.objectContaining({ code: "INVALID_REASON" }));
  });
  it.each([null, {}, { status: "AI_ACTIVE", claimedBy: "staff-1", reason: null }, { status: "STAFF_ACTIVE", claimedBy: "", reason: "return_request" }, { status: "WAITING_STAFF", claimedBy: null, reason: "policy_question" }])("fails closed on malformed state %j", (state) => {
    expect(canAiRespond(state)).toBe(false);
    expect(() => requestHandoff(state, "return_request")).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(() => claimHandoff(state, staff)).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(() => completeHandoff(state, staff)).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
  });
  it("never mutates inputs and returns immutable independent snapshots", () => {
    const input = { ...waiting };
    const actor = { ...staff };
    const next = claimHandoff(input, actor);
    expect(input).toEqual(waiting);
    actor.id = "changed";
    expect(next.claimedBy).toBe("staff-1");
    for (const output of [next, requestHandoff(input, "policy_question"), requestHandoff(active, "return_request"), completeHandoff(claimed, staff)]) {
      expect(Object.isFrozen(output)).toBe(true);
      expect(output).not.toBe(input);
    }
    expect(active).toEqual({ status: "AI_ACTIVE", reason: null, claimedBy: null });
    expect(claimed.claimedBy).toBe("staff-1");
  });
});
