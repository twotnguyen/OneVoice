// SPDX-License-Identifier: Apache-2.0

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readServerEnv } from "@/lib/env/server";

export function createSupabaseServerClient(): SupabaseClient {
  const { supabase } = readServerEnv();

  return createClient(supabase.url, supabase.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
