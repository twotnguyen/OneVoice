// SPDX-License-Identifier: Apache-2.0
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { provisionStaff, type StaffCommand, type StaffPage, type Reservation } from "./staff-admin";
export class StaffAdminError extends Error {
  constructor(public code: "FORBIDDEN" | "CONFLICT" | "LAST_MANAGER" | "INVALID" | "UNAVAILABLE") { super(code); }
}
function check(error: { code: string } | null) {
  if (error) throw new StaffAdminError(error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(error.code) ? "CONFLICT" : error.code === "23514" ? "LAST_MANAGER" : ["22023", "22P02"].includes(error.code) ? "INVALID" : "UNAVAILABLE");
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StaffAdminError("UNAVAILABLE")), 10_000); })]); }
  finally { clearTimeout(timer!); }
}
const resultSchema = z.object({ userId: z.string().uuid(), version: z.number().int().positive() });
export class StaffAdminRepository {
  constructor(private client: SupabaseClient<Database>, private digestKey: string) {}
  async list(organizationId: string, actorId: string, page = 1): Promise<StaffPage> {
    const { data, error, count } = await this.client.from("staff_profiles").select("user_id,display_name,role,active,version", { count: "exact" }).eq("organization_id", organizationId).order("created_at").order("user_id").range((page - 1) * 20, page * 20 - 1).abortSignal(AbortSignal.timeout(10_000));
    check(error);
    const items = z.array(z.object({ user_id: z.string().uuid(), display_name: z.string(), role: z.enum(["staff", "manager"]), active: z.boolean(), version: z.number().int() })).parse(data ?? []);
    const pendingResult = await this.client.from("staff_admin_requests").select("request_id,document").eq("organization_id", organizationId).eq("actor_id", actorId).eq("action", "create").is("completed_version", null).order("created_at", { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(10_000));
    check(pendingResult.error);
    const pending = (pendingResult.data ?? []).map(row => ({ requestId: row.request_id, ...z.object({ email: z.string(), displayName: z.string(), role: z.enum(["manager", "staff"]) }).parse(row.document) }));
    return { items, total: count ?? 0, page, pageSize: 20, pending };
  }
  async save(organizationId: string, actorId: string, input: StaffCommand) {
    if (input.action === "update") {
      const { data, error } = await this.client.rpc("update_staff_account", { p_organization_id: organizationId, p_actor_id: actorId, p_user_id: input.userId, p_request_id: input.requestId, p_expected_version: input.expectedVersion, p_display_name: input.displayName, p_role: input.role, p_active: input.active }).abortSignal(AbortSignal.timeout(10_000));
      check(error); return resultSchema.parse(data);
    }
    if (!this.digestKey) throw new StaffAdminError("UNAVAILABLE");
    return provisionStaff({
      reserve: async command => {
        // Keyed digest binds retries without persisting a password or an offline password verifier.
        const digest = createHmac("sha256", this.digestKey).update(command.requestId + "\0" + command.password).digest("hex");
        const { data, error } = await this.client.rpc("reserve_staff_account", { p_organization_id: organizationId, p_actor_id: actorId, p_request_id: command.requestId, p_email: command.email, p_display_name: command.displayName, p_role: command.role, p_credential_digest: digest }).abortSignal(AbortSignal.timeout(10_000));
        check(error); return z.object({ userId: z.string().uuid(), marker: z.string().uuid(), completed: z.boolean() }).parse(data) as Reservation;
      },
      find: async userId => {
        const { data, error } = await bounded(this.client.auth.admin.getUserById(userId));
        if (error) { if (error.status === 404) return null; throw new StaffAdminError("UNAVAILABLE"); }
        return data.user ? { id: data.user.id, email: data.user.email ?? "", marker: String(data.user.app_metadata.onevoice_staff_marker ?? "") } : null;
      },
      create: async (reservation, command) => {
        const { data, error } = await bounded(this.client.auth.admin.createUser({ id: reservation.userId, email: command.email, password: command.password, email_confirm: true, app_metadata: { onevoice_staff_marker: reservation.marker } }));
        if (error || !data.user) throw new StaffAdminError("UNAVAILABLE");
        return { id: data.user.id, email: data.user.email ?? "", marker: String(data.user.app_metadata.onevoice_staff_marker ?? "") };
      },
      finish: async requestId => {
        const { data, error } = await this.client.rpc("finish_staff_account", { p_organization_id: organizationId, p_actor_id: actorId, p_request_id: requestId }).abortSignal(AbortSignal.timeout(10_000));
        check(error); return resultSchema.parse(data);
      },
    }, input);
  }
}
