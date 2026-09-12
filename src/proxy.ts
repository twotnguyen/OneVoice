// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig } from "@/lib/auth/config";
import { createAuthClient } from "@/lib/auth/supabase";

/** Refresh only. Each protected entry point must independently verify its actor. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Auth routes own their cookie writes; avoid racing refresh against logout/login.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) return response;
  try {
    const client = createAuthClient(readAuthConfig(), {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    });
    await client.auth.getUser();
  } catch { /* Actual session checks fail closed at the protected entry point. */ }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };
