import { beforeEach, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";
const state = vi.hoisted(() => ({ actor: null as StaffSession | null, save: vi.fn(), list: vi.fn(), client: vi.fn(() => ({})) }));
vi.mock("@/lib/auth/routes", () => ({ createAuthContext: async () => ({ session: async () => state.actor, finish: (response: Response) => response }) }));
vi.mock("@/lib/auth/config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseDataClient: state.client }));
vi.mock("./repository", () => ({ KnowledgeRepository: class { save = state.save; list = state.list; }, KnowledgeError: class extends Error {} }));
import { GET, POST } from "@/app/api/knowledge/route";
const input = { id: "c0000000-0000-4000-8000-000000000011", requestId: "d0000000-0000-4000-8000-000000000011", expectedVersion: 0, document: { kind: "return", title: "Đổi trả", body: "Liên hệ hỗ trợ", startsAt: null, expiresAt: null, active: true, scope: "all", productIds: [], discountType: null, discountValue: null } };
const post = (origin = "https://app.test", value: unknown = input) => new Request("https://app.test/api/knowledge", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); state.actor = { userId: "actor", organizationId: "org", role: "manager", displayName: "Test" }; state.save.mockResolvedValue({ id: input.id, version: 1 }); });
it("denies staff and anonymous before storage", async () => {
  state.actor = null; expect((await GET(new Request("https://app.test/api/knowledge"))).status).toBe(401);
  state.actor = { userId: "staff", organizationId: "org", role: "staff", displayName: "Test" }; expect((await POST(post())).status).toBe(403); expect(state.client).not.toHaveBeenCalled();
});
it("rejects cross-origin and oversized writes", async () => {
  expect((await POST(post("https://evil.test"))).status).toBe(403);
  expect((await POST(post("https://app.test", { body: "x".repeat(70000) }))).status).toBe(400);
  expect(state.save).not.toHaveBeenCalled();
});
it("saves scoped manager document and does not accept actor body fields", async () => {
  expect((await POST(post())).status).toBe(200);
  expect(state.save).toHaveBeenCalledWith(state.actor, input);
  expect((await POST(post("https://app.test", { ...input, organizationId: "elsewhere" }))).status).toBe(400);
});
