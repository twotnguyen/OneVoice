// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import type { StaffSession } from "./session";
import { LoginLimiter, safeRedirect, sameOriginMutation } from "./security";

export type AuthContext = {
  signIn(email: string, password: string): Promise<boolean>;
  session(): Promise<StaffSession | null>;
  signOut(): Promise<boolean>;
  finish(response: NextResponse): NextResponse;
};
const noStore = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
const errorResponse = (status: number) => NextResponse.json({ error: status === 429 ? "Thử lại sau ít phút." : "Không thể thực hiện yêu cầu." }, { status, headers: noStore });

async function credentials(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") throw Error("format");
  const reader = request.body?.getReader();
  if (!reader) throw Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw Error("size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const email = form.get("email")?.trim().toLowerCase() ?? "";
  const password = form.get("password") ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) throw Error("input");
  return { email, password, next: safeRedirect(form.get("next")) };
}

export function createAuthHandlers(deps: { origin(): string; context(): AuthContext | Promise<AuthContext>; limiter: LoginLimiter }) {
  function redirect(path: string) { return NextResponse.redirect(new URL(path, deps.origin()), { status: 303, headers: noStore }); }
  return {
    async login(request: Request) {
      let context: AuthContext | undefined;
      try {
        if (!sameOriginMutation(request, deps.origin())) return errorResponse(403);
        let input: Awaited<ReturnType<typeof credentials>>;
        try { input = await credentials(request); } catch { return errorResponse(400); }
        if (!deps.limiter.take(input.email)) { const response = errorResponse(429); response.headers.set("Retry-After", "60"); return response; }
        context = await deps.context();
        if (!await context.signIn(input.email, input.password) || !await context.session()) {
          await context.signOut();
          return context.finish(redirect(`/login?error=invalid&next=${encodeURIComponent(input.next)}`));
        }
        return context.finish(redirect(input.next));
      } catch { return context ? context.finish(errorResponse(503)) : errorResponse(503); }
    },
    async logout(request: Request) {
      let context: AuthContext | undefined;
      try {
        if (!sameOriginMutation(request, deps.origin())) return errorResponse(403);
        context = await deps.context();
        return context.finish(await context.signOut() ? redirect("/login") : errorResponse(503));
      } catch { return context ? context.finish(errorResponse(503)) : errorResponse(503); }
    },
    async session() {
      let context: AuthContext | undefined;
      try {
        context = await deps.context();
        const actor = await context.session();
        return context.finish(actor ? NextResponse.json({ actor }, { headers: noStore }) : errorResponse(401));
      } catch { return context ? context.finish(errorResponse(503)) : errorResponse(503); }
    },
  };
}
