// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { createStaffOrdersRepository, createAutomationOrdersRepository, type OrdersPort } from "./repository";
function port(client: SupabaseClient<Database>): OrdersPort {
  return { rpc: (name, args) => client.rpc(name, args as Database["public"]["Functions"][typeof name]["Args"]) };
}
export function createSupabaseStaffOrdersRepository(client: SupabaseClient<Database>, actor: StaffSession) {
  return createStaffOrdersRepository(port(client), actor);
}
export function createSupabaseAutomationOrdersRepository(client: SupabaseClient<Database>, context: { organizationId: string; ownerId: string; conversationId: string | null }) {
  return createAutomationOrdersRepository(port(client), context);
}
