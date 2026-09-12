// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createConversationRepository } from "./repository";
export function createSupabaseConversationRepository(client: SupabaseClient<Database>) {
 return createConversationRepository({ rpc: (name, args, signal) => client.rpc(name, args as Database["public"]["Functions"][typeof name]["Args"]).abortSignal(signal) });
}
