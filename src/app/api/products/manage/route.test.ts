// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: null as null | { userId: string; organizationId: string; role: string }, client: vi.fn(), save: vi.fn(), list: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/auth/routes", () => ({ createAuthContext: async () => ({ session: async () => m.actor, finish: (response: Response) => response }) }));
vi.mock("@/lib/auth/config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseDataClient: m.client }));
vi.mock("@/lib/catalog/management-repository", async (actual) => {
  const mod = await actual<typeof import("@/lib/catalog/management-repository")>();
  return { ...mod, CatalogManagementRepository: class { save = m.save; list = m.list; get = m.get; } };
});
import { GET, POST } from "./route";
import { ManagementError } from "@/lib/catalog/management-repository";
const id = "c0000000-0000-4000-8000-000000000001";
const body = { requestId: id, productId: id, expectedVersion: 0, document: { name: "Mouse", sku: null, brand: null, productType: "mouse", descriptionText: null, priceVnd: 10, stockQuantity: null, inStock: true, active: true, specifications: [], images: [], variants: [] } };
const post = (payload: unknown = body, origin = "https://app.test") => new Request("https://app.test/api/products/manage", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) });
beforeEach(() => { vi.clearAllMocks(); m.actor = null; });
it("denies anonymous and staff before creating a service client", async () => {
  expect((await GET(new Request("https://app.test/api/products/manage"))).status).toBe(401);
  m.actor = { userId: id, organizationId: "org", role: "staff" };
  expect((await POST(post())).status).toBe(403);
  expect(m.client).not.toHaveBeenCalled();
});
it("rejects manager cross-origin and invalid commands before saving", async () => {
  m.actor = { userId: id, organizationId: "org", role: "manager" };
  expect((await POST(post(body, "https://evil.test"))).status).toBe(403);
  expect((await POST(post({ ...body, actorId: "forged" }))).status).toBe(400);
  expect(m.save).not.toHaveBeenCalled();
});
it("saves using the verified actor and returns version or safe conflict", async () => {
  m.actor = { userId: id, organizationId: "org", role: "manager" };
  m.save.mockResolvedValueOnce({ productId: id, version: 1 });
  const result = await POST(post());
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ productId: id, version: 1 });
  expect(m.save).toHaveBeenCalledWith(m.actor, body);
  m.save.mockRejectedValueOnce(new ManagementError("CONFLICT"));
  expect((await POST(post())).status).toBe(409);
});
it("passes bounded all-group filters to the database repository", async () => {
  m.actor = { userId: id, organizationId: "org", role: "manager" };
  m.list.mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 20 });
  expect((await GET(new Request("https://app.test/api/products/manage?page=2&productType=keyboard"))).status).toBe(200);
  expect(m.list).toHaveBeenCalledWith("org", { page: 2, pageSize: 20, productType: "keyboard", search: "", active: "all" });
});
