// SPDX-License-Identifier: Apache-2.0

export const BUSINESS_ROLES = Object.freeze(["manager", "staff"] as const);
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const BUSINESS_ACTIONS = Object.freeze([
  "read_catalog",
  "read_operations",
  "claim_handoff",
  "complete_handoff",
  "update_order",
  "update_shipping",
  "update_warranty",
  "manage_catalog",
  "manage_policies",
  "manage_ai",
  "manage_marketing",
  "manage_staff",
  "read_audit",
] as const);
export type BusinessAction = (typeof BUSINESS_ACTIONS)[number];

const staffActions: ReadonlySet<string> = new Set<BusinessAction>([
  "read_catalog",
  "read_operations",
  "claim_handoff",
  "complete_handoff",
  "update_order",
  "update_shipping",
  "update_warranty",
]);
const knownActions: ReadonlySet<string> = new Set(BUSINESS_ACTIONS);

/** Role policy only; callers must separately verify the session and actor scope. */
export function canPerformBusinessAction(role: unknown, action: unknown): boolean {
  if (typeof action !== "string" || !knownActions.has(action)) return false;
  if (role === "manager") return true;
  return role === "staff" && staffActions.has(action);
}
