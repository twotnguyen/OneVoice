// SPDX-License-Identifier: Apache-2.0
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { readAuthConfig } from "./config";
import type { SessionPort } from "./session";

export function createAuthClient(config: ReturnType<typeof readAuthConfig>, cookies: CookieMethodsServer) {
  return createServerClient<Database>(config.url, config.key, {
    cookies,
    cookieOptions: { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export function sessionPort(client: SupabaseClient<Database>): SessionPort {
  return {
    async getUser() {
      const { data, error } = await client.auth.getUser();
      return error ? null : data.user;
    },
    async getProfile(userId, organizationId) {
      const { data, error } = await client.from("staff_profiles").select("user_id,organization_id,role,active,display_name")
        .eq("user_id", userId).eq("organization_id", organizationId).eq("active", true).maybeSingle();
      return error ? null : data;
    },
  };
}
