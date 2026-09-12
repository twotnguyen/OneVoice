// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "./session";
const mocks = vi.hoisted(() => ({ actor: null as StaffSession | null, fail: false, finish: vi.fn((response: Response) => response) }));
vi.mock("./routes", () => ({ createAuthContext: async () => ({ session: async () => { if (mocks.fail) throw Error("secret"); return mocks.actor; }, finish: mocks.finish }) }));
vi.mock("./session", () => ({ getStaffSession: async () => mocks.actor }));
vi.mock("./config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`REDIRECT:${url}`); } }));
import { withApiPermission, requirePagePermission, requireActionPermission, RenderRequestLimiter } from "./guards";
const staff: StaffSession = { userId: "u", organizationId: "o", role: "staff", displayName: "Test" };
const request = (method = "GET", origin = "https://app.test") => new Request("https://app.test/api/renders", { method, headers: { origin } });
beforeEach(() => { mocks.actor = null; mocks.fail = false; vi.clearAllMocks(); });
describe("entry point guard", () => {
  it("denies anonymous before the protected callback and applies response security", async () => {
    const callback = vi.fn(async () => Response.json({ secret: true }));
    const result = await withApiPermission(request(), "read_catalog", callback);
    expect(result.status).toBe(401); expect(callback).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  });
  it("permits staff catalog reads but denies marketing actions", async () => {
    mocks.actor = staff;
    expect((await withApiPermission(request(), "read_catalog", async (actor) => Response.json({ user: actor.userId }))).status).toBe(200);
    const callback = vi.fn(async () => new Response());
    expect((await withApiPermission(request("POST"), "manage_marketing", callback, { mutation: true })).status).toBe(403);
    expect(callback).not.toHaveBeenCalled();
  });
  it("requires same Origin before invoking a manager mutation", async () => {
    mocks.actor = { ...staff, role: "manager" };
    const callback = vi.fn(async () => new Response(null, { status: 202 }));
    expect((await withApiPermission(request("POST", "https://evil.test"), "manage_marketing", callback, { mutation: true })).status).toBe(403);
    expect(callback).not.toHaveBeenCalled();
    expect((await withApiPermission(request("POST"), "manage_marketing", callback, { mutation: true })).status).toBe(202);
  });
  it("fails closed when session verification throws", async () => {
    mocks.fail = true;
    const callback = vi.fn(async () => new Response());
    expect((await withApiPermission(request(), "read_catalog", callback)).status).toBe(503);
    expect(callback).not.toHaveBeenCalled();
  });
  it("limits authenticated render attempts and expires the bounded window", async () => {
    mocks.actor = { ...staff, role: "manager" };
    let now = 0; const limiter = new RenderRequestLimiter(() => now, 2, 3, 1000);
    const callback = vi.fn(async () => new Response(null, { status: 202 }));
    const call = () => withApiPermission(request("POST"), "manage_marketing", callback, { mutation: true, limiter });
    expect((await call()).status).toBe(202); expect((await call()).status).toBe(202);
    expect((await call()).status).toBe(429); expect(callback).toHaveBeenCalledTimes(2);
    mocks.actor = { ...mocks.actor, userId: "second" };
    expect((await call()).status).toBe(202);
    mocks.actor = { ...mocks.actor, userId: "third" };
    expect((await call()).status).toBe(429);
    now = 1001; expect((await call()).status).toBe(202);
  });
  it("redirects anonymous pages and prevents staff manager pages", async () => {
    await expect(requirePagePermission("read_catalog", "/catalog")).rejects.toThrow("REDIRECT:/login?next=%2Fcatalog");
    mocks.actor = staff;
    await expect(requirePagePermission("manage_marketing", "/history")).rejects.toThrow("REDIRECT:/catalog");
    expect(await requirePagePermission("read_catalog", "/catalog")).toEqual(staff);
  });
  it("checks action authorization independently of page rendering", async () => {
    await expect(requireActionPermission("read_catalog")).rejects.toThrow("UNAUTHENTICATED");
    mocks.actor = staff;
    expect(await requireActionPermission("read_catalog")).toEqual(staff);
    await expect(requireActionPermission("manage_marketing")).rejects.toThrow("FORBIDDEN");
  });
});
