import { describe, expect, it } from "vitest";
import { verifyStaffSession, type SessionPort } from "./session";
import { safeRedirect, sameOriginMutation, LoginLimiter } from "./security";

const profile = { user_id: "user-1", organization_id: "org-1", role: "staff", active: true, display_name: "Test" };
function port(overrides: Partial<SessionPort> = {}): SessionPort {
  return { getUser: async () => ({ id: "user-1" }), getProfile: async () => profile, ...overrides };
}
describe("verified staff session", () => {
  it("returns only fresh profile authority", async () => {
    expect(await verifyStaffSession(port(), "org-1")).toEqual({ userId: "user-1", organizationId: "org-1", role: "staff", displayName: "Test" });
  });
  it.each([null, { ...profile, active: false }, { ...profile, organization_id: "other" }, { ...profile, role: "admin" }, { ...profile, user_id: "other" }])("denies absent/inactive/wrong-scope/invalid profile %j", async (value) => {
    expect(await verifyStaffSession(port({ getProfile: async () => value }), "org-1")).toBeNull();
  });
  it("denies invalid or expired token before profile lookup", async () => {
    expect(await verifyStaffSession(port({ getUser: async () => null, getProfile: async () => { throw Error("should not read"); } }), "org-1")).toBeNull();
  });
  it("rechecks profile on every call and fails closed on outage", async () => {
    let active = true;
    const adapter = port({ getProfile: async () => ({ ...profile, active }) });
    expect(await verifyStaffSession(adapter, "org-1")).not.toBeNull();
    active = false;
    expect(await verifyStaffSession(adapter, "org-1")).toBeNull();
    expect(await verifyStaffSession(port({ getUser: async () => { throw Error("offline"); } }), "org-1")).toBeNull();
  });
});
describe("auth request security", () => {
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/api/auth/logout", "/login", "\n/dashboard"])("rejects redirect %s", (value) => expect(safeRedirect(value)).toBe("/dashboard"));
  it("preserves an internal destination", () => expect(safeRedirect("/history?page=2")).toBe("/history?page=2"));
  it.each(["/a/..//outside.invalid", "/a/%2e%2e//outside.invalid"])("rejects normalized protocol-relative redirect %s", (value) => expect(safeRedirect(value)).toBe("/dashboard"));
  it("requires exact configured Origin and POST", () => {
    const request = (origin?: string, method = "POST") => new Request("https://app.test/api/auth/login", { method, headers: origin ? { Origin: origin } : {} });
    expect(sameOriginMutation(request("https://app.test"), "https://app.test")).toBe(true);
    expect(sameOriginMutation(request(), "https://app.test")).toBe(false);
    expect(sameOriginMutation(request("https://evil.test"), "https://app.test")).toBe(false);
    expect(sameOriginMutation(request("https://app.test", "GET"), "https://app.test")).toBe(false);
  });
  it("bounds per-account and total attempts without trusting spoofed IPs; expires", () => {
    let now = 0;
    const limiter = new LoginLimiter(() => now, 2, 3, 1000);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    expect(limiter.take("c")).toBe(false);
    now = 1001;
    expect(limiter.take("a")).toBe(true);
  });
});
