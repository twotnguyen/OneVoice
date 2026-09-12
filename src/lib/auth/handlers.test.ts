import { describe, expect, it } from "vitest";
import { createAuthHandlers, type AuthContext } from "./handlers";
import { LoginLimiter } from "./security";

const actor = { userId: "u", organizationId: "o", role: "staff" as const, displayName: "Test" };
function setup(overrides: Partial<AuthContext> = {}) {
  const context: AuthContext = { signIn: async () => true, session: async () => actor, signOut: async () => true, finish: (response) => response, ...overrides };
  return createAuthHandlers({ origin: () => "https://app.test", context: () => context, limiter: new LoginLimiter(() => 0, 2) });
}
function request(path = "login", origin = "https://app.test", body = "email=test%40example.test&password=secret&next=%2Fhistory") {
  return new Request(`https://app.test/api/auth/${path}`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body });
}
describe("auth handlers", () => {
  it("logs in and redirects internally without exposing credentials", async () => {
    const response = await setup().login(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/history");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("secret");
  });
  it.each([false, null])("denies failed password or missing profile %j", async (result) => {
    const handlers = setup(result === false ? { signIn: async () => false } : { session: async () => null });
    const response = await handlers.login(request());
    expect(response.headers.get("location")).toContain("error=invalid");
  });
  it("blocks cross-site mutations before provider work", async () => {
    const handlers = setup({ signIn: async () => { throw Error("must not call"); } });
    expect((await handlers.login(request("login", "https://evil.test"))).status).toBe(403);
    expect((await handlers.logout(request("logout", "null"))).status).toBe(403);
  });
  it("limits login attempts", async () => {
    const handlers = setup();
    await handlers.login(request()); await handlers.login(request());
    expect((await handlers.login(request())).status).toBe(429);
  });
  it("bounds body size and rejects malformed input", async () => {
    expect((await setup().login(request("login", "https://app.test", "x".repeat(9000)))).status).toBe(400);
    expect((await setup().login(request("login", "https://app.test", "email=&password="))).status).toBe(400);
  });
  it("fails closed on token expiry, disabled profile or provider failure", async () => {
    expect((await setup({ session: async () => null }).session()).status).toBe(401);
    expect((await setup({ session: async () => { throw Error("secret provider detail"); } }).session()).status).toBe(503);
  });
  it("logout succeeds with no active session and returns to login", async () => {
    const response = await setup({ session: async () => null }).logout(request("logout"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/login");
  });
});
