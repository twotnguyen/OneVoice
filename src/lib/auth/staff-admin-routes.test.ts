import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: null as null | { role: string; userId: string; organizationId: string }, client: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock("./routes", () => ({ createAuthContext: async () => ({ session: async () => state.actor, finish: (r: Response) => r }) }));
vi.mock("./config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseDataClient: state.client }));
vi.mock("./staff-admin-repository", () => ({ StaffAdminError: class extends Error {}, StaffAdminRepository: class { list = state.list; save = state.save; } }));
import { GET, POST } from "@/app/api/staff/route";
const request = (body: unknown, origin = "https://app.test") => new Request("https://app.test/api/staff", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.actor = null; state.list.mockResolvedValue({ items: [] }); state.save.mockResolvedValue({ version: 1 }); });
it("denies anonymous and staff before composing privileged storage", async () => {
 expect((await GET(new Request("https://app.test/api/staff"))).status).toBe(401);
 state.actor = { role: "staff", userId: "staff", organizationId: "org" };
 expect((await GET(new Request("https://app.test/api/staff"))).status).toBe(403);
 expect((await POST(request({}))).status).toBe(403); expect(state.client).not.toHaveBeenCalled();
});
it("bounds request bodies and checks mutation origin without echoing secrets", async () => {
 state.actor = { role: "manager", userId: "manager", organizationId: "org" };
 expect((await POST(request({}, "https://evil.test"))).status).toBe(403);
 const response = await POST(request({ password: "secret-value", large: "x".repeat(10000) }));
 expect(response.status).toBe(400); expect(await response.text()).not.toContain("secret-value"); expect(state.save).not.toHaveBeenCalled();
});
