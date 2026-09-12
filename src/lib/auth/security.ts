// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";

export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || /[\\\s]/.test(value)) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\s]/.test(decoded)) return "/dashboard";
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" || url.pathname.startsWith("//") || url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch { return "/dashboard"; }
}

/** Exact Origin validation is the CSRF boundary; forwarded headers are untrusted. */
export function sameOriginMutation(request: Request, origin: string): boolean {
  return request.method === "POST" && request.headers.get("origin") === origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

/** Per-process defense in depth, alongside Supabase Auth rate limits.
 * Fixed window and total cap bound memory even with many distinct accounts.
 * Multiple replicas require a shared ingress limiter; restarts reset this one.
 */
export class LoginLimiter {
  private accounts = new Map<string, number>();
  private start = 0;
  private total = 0;
  constructor(private now = Date.now, private perAccount = 5, private maximum = 100, private windowMs = 60_000) {}
  take(email: string): boolean {
    const now = this.now();
    if (now - this.start >= this.windowMs) { this.accounts.clear(); this.total = 0; this.start = now; }
    const key = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    const count = this.accounts.get(key) ?? 0;
    if (this.total >= this.maximum || count >= this.perAccount) return false;
    this.total++;
    this.accounts.set(key, count + 1);
    return true;
  }
}
