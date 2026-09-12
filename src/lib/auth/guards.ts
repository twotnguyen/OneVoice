// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { canPerformBusinessAction, type BusinessAction } from "@/lib/business/permissions";
import { readAuthConfig } from "./config";
import { createAuthContext } from "./routes";
import { LoginLimiter, safeRedirect, sameOriginMutation } from "./security";
import { getStaffSession, type StaffSession } from "./session";
import type { AuthContext } from "./handlers";

/** Per-process bounded admission, 5/user and 30 total per minute by default.
 * Restarts reset it; multi-replica deployments also need a shared ingress limit.
 * Identity comes only from the verified session, never forwarded IP headers.
 */
export class RenderRequestLimiter extends LoginLimiter {
  constructor(now = Date.now, perActor = 5, total = 30, windowMs = 60_000) {
    super(now, perActor, total, windowMs);
  }
}
export const renderRequestLimiter = new RenderRequestLimiter();

function deny(status: number, code: string) {
  const response = NextResponse.json({ error: { code } }, { status });
  if (status === 429) response.headers.set("Retry-After", "60");
  return response;
}

/** The callback is deliberately lazy: service-role composition must start inside it. */
export async function withApiPermission(
  request: Request,
  action: BusinessAction,
  run: (actor: StaffSession) => Promise<Response>,
  options: { mutation?: boolean; limiter?: RenderRequestLimiter } = {},
): Promise<Response> {
  let context: AuthContext | undefined;
  const finish = (response: Response): Response => {
    const next = new NextResponse(request.method === "HEAD" ? null : response.body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
    const finished = context ? context.finish(next) : next;
    finished.headers.set("Cache-Control", "private, no-store");
    finished.headers.set("X-Content-Type-Options", "nosniff");
    return finished;
  };
  try {
    context = await createAuthContext();
    const actor = await context.session();
    if (!actor) return finish(deny(401, "UNAUTHENTICATED"));
    if (!canPerformBusinessAction(actor.role, action)) return finish(deny(403, "FORBIDDEN"));
    if (options.mutation && !sameOriginMutation(request, readAuthConfig().origin)) return finish(deny(403, "FORBIDDEN"));
    if (options.limiter && !options.limiter.take(`${actor.organizationId}:${actor.userId}`)) return finish(deny(429, "RATE_LIMITED"));
    return finish(await run(actor));
  } catch {
    return finish(deny(503, "SERVICE_UNAVAILABLE"));
  }
}

/** Per-page check is required even when the shared layout also verifies login. */
export async function requirePagePermission(action: BusinessAction, destination: string): Promise<StaffSession> {
  const actor = await getStaffSession();
  if (!actor) redirect(`/login?next=${encodeURIComponent(safeRedirect(destination))}`);
  // Catalog is the existing staff landing page; do not render manager-only data.
  if (!canPerformBusinessAction(actor.role, action)) redirect("/catalog");
  return actor;
}

/** Independently guard Server Actions; Next also verifies their POST Origin. */
export async function requireActionPermission(action: BusinessAction): Promise<StaffSession> {
  const actor = await getStaffSession();
  if (!actor) throw Error("UNAUTHENTICATED");
  if (!canPerformBusinessAction(actor.role, action)) throw Error("FORBIDDEN");
  return actor;
}
