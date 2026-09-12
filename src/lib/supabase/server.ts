// SPDX-License-Identifier: Apache-2.0

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { readServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/database.types";

/** Business data access needs database credentials only. Call after authorization. */
export function createSupabaseDataClient(source: Readonly<Record<string, string | undefined>> = process.env): SupabaseClient<Database> {
  const parsed = z.object({ url: z.url(), secretKey: z.string().min(1) }).safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL, secretKey: source.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) throw Error("Invalid Supabase data configuration");
  return createClient<Database>(parsed.data.url, parsed.data.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export function createSupabaseServerClient(): SupabaseClient<Database> {
  const { supabase } = readServerEnv();

  return createClient<Database>(supabase.url, supabase.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
