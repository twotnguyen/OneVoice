import { expect, it, vi } from "vitest";
import { createWarrantyRepository, createCustomerWarrantyReader, type WarrantyPort } from "./repository";
const org = "a2600000-0000-4000-8000-000000000001", actor = { organizationId: org, userId: "b2600000-0000-4000-8000-000000000001", role: "staff" as const, displayName: "Fixture" };
it("binds staff identity in fresh read RPC", async () => { const rpc = vi.fn<WarrantyPort["rpc"]>().mockResolvedValue({ data: { page: 1, total: 0, items: [] }, error: null }); await createWarrantyRepository({ rpc }, actor).list({ page: 1, search: "" }); expect(rpc).toHaveBeenCalledWith("read_staff_warranty", expect.objectContaining({ p_actor_id: actor.userId, p_organization_id: org })); });
it("customer reader has no mutation and rejects leaked private DTO", async () => {
 const rpc = vi.fn<WarrantyPort["rpc"]>().mockResolvedValue({ data: [{ id: org, status: "RECEIVED", customerNote: "Visible", updatedAt: "now", history: [], privateNote: "private" }], error: null });
 const reader = createCustomerWarrantyReader({ rpc }, { organizationId: org, conversationId: actor.userId });
 expect("save" in reader).toBe(false); await expect(reader.get(org)).rejects.toThrow();
 expect(rpc).toHaveBeenCalledWith("read_customer_warranty", { p_organization_id: org, p_conversation_id: actor.userId, p_order_id: org });
});
it("database errors do not leak customer data", async () => { const rpc = vi.fn<WarrantyPort["rpc"]>().mockResolvedValue({ data: null, error: { code: "40001" } }); await expect(createWarrantyRepository({ rpc }, actor).get(org)).rejects.toThrow("CONFLICT"); });
