// SPDX-License-Identifier: Apache-2.0
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { readAuthConfig } from "./config";
import { createAuthHandlers, type AuthContext } from "./handlers";
import { LoginLimiter } from "./security";
import { verifyStaffSession } from "./session";
import { createAuthClient, sessionPort } from "./supabase";

/** Request-local verified session and refresh cookies, shared by protected APIs. */
export async function createAuthContext(): Promise<AuthContext> {
    const config = readAuthConfig();
    const store = await cookies();
    const jar = new Map(store.getAll().map((cookie) => [cookie.name, cookie.value]));
    const pending = new Map<string, { value: string; options: CookieOptions }>();
    const headers = new Headers();
    const client = createAuthClient(config, {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(values, extraHeaders) {
        for (const { name, value, options } of values) { jar.set(name, value); pending.set(name, { value, options }); }
        Object.entries(extraHeaders).forEach(([name, value]) => headers.set(name, value));
      },
    });
    return {
      async signIn(email, password) { const { error } = await client.auth.signInWithPassword({ email, password }); return !error; },
      session: () => verifyStaffSession(sessionPort(client), config.organizationId),
      async signOut() {
        try { const { error } = await client.auth.signOut({ scope: "local" }); return !error; }
        finally {
          // Also clear corrupt/stale chunks when the provider cannot recover them.
          const prefix = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
          for (const name of jar.keys()) if (name === prefix || name.startsWith(`${prefix}.`) || name === `${prefix}-code-verifier`) {
            pending.set(name, { value: "", options: { path: "/", maxAge: 0, httpOnly: true, secure: config.secure, sameSite: "lax" } });
          }
        }
      },
      finish(response) {
        for (const [name, { value, options }] of pending) response.cookies.set(name, value, { ...options, httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" });
        headers.forEach((value, name) => response.headers.set(name, value));
        return response;
      },
    };
}

export const authHandlers = createAuthHandlers({
  origin: () => readAuthConfig().origin,
  limiter: new LoginLimiter(),
  context: createAuthContext,
});
