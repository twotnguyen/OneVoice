// SPDX-License-Identifier: Apache-2.0

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/database.types";

export function createSupabaseServerClient(): SupabaseClient<Database> {
  const { supabase } = readServerEnv();

  return createClient<Database>(supabase.url, supabase.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
