// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  BUSINESS_ACTIONS,
  BUSINESS_ROLES,
  canPerformBusinessAction,
} from "./permissions";

const matrix = [
  ["read_catalog", true, true],
  ["read_operations", true, true],
  ["claim_handoff", true, true],
  ["complete_handoff", true, true],
  ["update_order", true, true],
  ["update_shipping", true, true],
  ["update_warranty", true, true],
  ["manage_catalog", true, false],
  ["manage_policies", true, false],
  ["manage_ai", true, false],
  ["manage_marketing", true, false],
  ["manage_staff", true, false],
  ["read_audit", true, false],
] as const;

const invalidInputs: unknown[] = [
  null, undefined, "", "unknown", "admin", "marketing", "Manager", "STAFF",
  " manager", "staff ", "READ_CATALOG", "read_catalog ",
  "__proto__", "constructor", "prototype", "toString", "valueOf",
  "hasOwnProperty", "__defineGetter__", 0, 1, NaN, Infinity, true, false,
  1n, Symbol("manager"), {}, [], ["manager"], ["read_catalog"],
  new String("manager"), new String("read_catalog"),
  { role: "manager" }, { action: "read_catalog" },
  { toString: () => "manager" }, () => "manager", Object.create(null),
];

describe("canPerformBusinessAction", () => {
  it.each(matrix)("enforces both roles for %s", (action, manager, staff) => {
    expect(canPerformBusinessAction("manager", action)).toBe(manager);
    expect(canPerformBusinessAction("staff", action)).toBe(staff);
  });

  it("exports only the canonical roles and actions", () => {
    expect(BUSINESS_ROLES).toEqual(["manager", "staff"]);
    expect(BUSINESS_ACTIONS).toEqual(matrix.map(([action]) => action));
    expect(Object.isFrozen(BUSINESS_ROLES)).toBe(true);
    expect(Object.isFrozen(BUSINESS_ACTIONS)).toBe(true);
  });

  it.each(invalidInputs.map((value, index) => ({ value, index })))(
    "denies invalid role input $index for every action",
    ({ value }) => {
      for (const [action] of matrix) {
        expect(canPerformBusinessAction(value, action)).toBe(false);
      }
    },
  );

  it.each(invalidInputs.map((value, index) => ({ value, index })))(
    "denies invalid action input $index for both roles",
    ({ value }) => {
      expect(canPerformBusinessAction("manager", value)).toBe(false);
      expect(canPerformBusinessAction("staff", value)).toBe(false);
    },
  );

  it("does not coerce untrusted objects", () => {
    const hostile = {
      [Symbol.toPrimitive]() { throw new Error("must not coerce"); },
    };
    expect(canPerformBusinessAction(hostile, "read_catalog")).toBe(false);
    expect(canPerformBusinessAction("manager", hostile)).toBe(false);
    expect(canPerformBusinessAction(null, null)).toBe(false);
  });
});
