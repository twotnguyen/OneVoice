// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
const role = z.enum(["manager", "staff"]);
const displayName = z.string().trim().min(1).max(160);
export const staffCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), requestId: z.string().uuid(), email: z.email().max(254).transform(value => value.toLowerCase()), password: z.string().min(12).max(128), displayName, role }),
  z.strictObject({ action: z.literal("update"), requestId: z.string().uuid(), userId: z.string().uuid(), expectedVersion: z.number().int().min(1).max(2147483646), displayName, role, active: z.boolean() }),
]);
export type StaffCommand = z.infer<typeof staffCommandSchema>;
export type CreateStaff = Extract<StaffCommand, { action: "create" }>;
export type StaffRecord = { user_id: string; display_name: string; role: "manager" | "staff"; active: boolean; version: number };
export type PendingStaff = { requestId: string; email: string; displayName: string; role: "manager" | "staff" };
export type StaffPage = { items: StaffRecord[]; total: number; page: number; pageSize: number; pending: PendingStaff[] };
export type Reservation = { userId: string; marker: string; completed: boolean };
type Identity = { id: string; email: string; marker: string };
export type ProvisionPort = {
  reserve(input: CreateStaff): Promise<Reservation>;
  find(userId: string): Promise<Identity | null>;
  create(reservation: Reservation, input: CreateStaff): Promise<Identity>;
  finish(requestId: string): Promise<{ userId: string; version: number }>;
};
/** Pending Auth identities have no staff profile. Retry by reserved identity, never by email. */
export async function provisionStaff(port: ProvisionPort, input: CreateStaff) {
  const reserved = await port.reserve(input);
  if (reserved.completed) return port.finish(input.requestId);
  let identity = await port.find(reserved.userId);
  if (!identity) {
    try { identity = await port.create(reserved, input); }
    catch { identity = await port.find(reserved.userId); }
  }
  if (!identity || identity.id !== reserved.userId || identity.email.toLowerCase() !== input.email || identity.marker !== reserved.marker) throw Error("PROVISION_FAILED");
  return port.finish(input.requestId);
}
