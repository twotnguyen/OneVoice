import { beforeEach, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";
import { defaultSettings, SettingsConflict } from "./settings";
const state = vi.hoisted(() => ({ actor: null as StaffSession | null, read: vi.fn(), save: vi.fn(), audit: vi.fn(), client: vi.fn(() => ({})) }));
vi.mock("@/lib/auth/routes", () => ({ createAuthContext: async () => ({ session: async () => state.actor, finish: (response: Response) => response }) }));
vi.mock("@/lib/auth/config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseDataClient: state.client }));
vi.mock("./settings-supabase", () => ({ createSupabaseSettingsRepository: () => ({ read: state.read, save: state.save }) }));
vi.mock("@/lib/audit/supabase", () => ({ createSupabaseAuditRepository: () => ({ list: state.audit }) }));
import { GET, POST } from "@/app/api/settings/route";
import { GET as audit } from "@/app/api/audit/route";
const manager: StaffSession = { userId: "actor", organizationId: "scope", role: "manager", displayName: "Test" };
const command = () => ({ expectedRevision: 0, requestId: "c0000000-0000-4000-8000-000000000008", settings: defaultSettings().settings });
const request = (body: unknown = command(), origin = "https://app.test") => new Request("https://app.test/api/settings", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.actor = manager; state.read.mockResolvedValue(defaultSettings()); state.save.mockResolvedValue({ ...defaultSettings(), revision: 1 }); });
it("denies anonymous and staff before settings or audit storage", async () => {
  state.actor = null;
  expect((await GET(new Request("https://app.test/api/settings"))).status).toBe(401);
  state.actor = { ...manager, role: "staff" };
  expect((await POST(request())).status).toBe(403);
  expect((await audit(new Request("https://app.test/api/audit"))).status).toBe(403);
  expect(state.client).not.toHaveBeenCalled();
});
it("checks mutation Origin", async () => {
  expect((await POST(request(command(), "https://evil.test"))).status).toBe(403);
  expect(state.save).not.toHaveBeenCalled();
});
it("rejects invalid settings and oversized requests", async () => {
  expect((await POST(request({ ...command(), settings: { ...defaultSettings().settings, timezone: "Invalid/Zone" } }))).status).toBe(400);
  expect((await POST(request({ x: "x".repeat(33000) }))).status).toBe(400);
  expect(state.save).not.toHaveBeenCalled();
});
it("saves only server actor/scope and canonical timezone", async () => {
  const response = await POST(request({ ...command(), settings: { ...defaultSettings().settings, timezone: "asia/ho_chi_minh" } }));
  expect(response.status).toBe(200);
  expect(state.save).toHaveBeenCalledWith("scope", "actor", expect.objectContaining({ expectedRevision: 0, settings: expect.objectContaining({ timezone: "Asia/Saigon" }) }));
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("returns a conflict when an optimistic version loses", async () => {
  state.save.mockRejectedValueOnce(new SettingsConflict());
  const response = await POST(request());
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "VERSION_CONFLICT" });
});
it("reads the latest revision on the next request", async () => {
  state.read.mockResolvedValueOnce({ ...defaultSettings(), revision: 2 }).mockResolvedValueOnce({ ...defaultSettings(), revision: 3 });
  expect((await (await GET(new Request("https://app.test/api/settings"))).json()).revision).toBe(2);
  expect((await (await GET(new Request("https://app.test/api/settings"))).json()).revision).toBe(3);
});
it("bounds audit pages and scopes filters to the manager installation", async () => {
  state.audit.mockResolvedValue({ events: [], next_cursor: null });
  expect((await audit(new Request("https://app.test/api/audit?limit=101"))).status).toBe(400);
  expect(state.audit).not.toHaveBeenCalled();
  expect((await audit(new Request("https://app.test/api/audit?limit=20&action=business.settings_updated"))).status).toBe(200);
  expect(state.audit).toHaveBeenCalledWith({ organization_id: "scope", limit: 20, action: "business.settings_updated", cursor: undefined });
});
