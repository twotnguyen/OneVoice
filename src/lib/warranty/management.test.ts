import { describe, expect, it } from "vitest";
import { warrantyCommandSchema, allowedWarrantyTransition, customerProgressSchema } from "./management";
const command = { id: "a0000000-0000-4000-8000-000000000026", requestId: "b0000000-0000-4000-8000-000000000026", expectedVersion: 0, orderId: "c0000000-0000-4000-8000-000000000026", lineNumber: 1, status: "RECEIVED", customerNote: "Đã tiếp nhận", privateNote: "Nội bộ" };
describe("warranty boundary", () => {
  it("accepts staff note separation", () => expect(warrantyCommandSchema.parse(command).privateNote).toBe("Nội bộ"));
  it.each([{ status: "APPROVED" }, { lineNumber: 0 }, { expectedVersion: -1 }, { actorId: "forged" }, { customerNote: "<script>x</script>" }])("rejects invalid command %j", patch => expect(warrantyCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false));
  it("allows adjacent progress and same-status notes only", () => {
    expect(allowedWarrantyTransition("RECEIVED", "INSPECTING")).toBe(true);
    expect(allowedWarrantyTransition("INSPECTING", "INSPECTING")).toBe(true);
    expect(allowedWarrantyTransition("RECEIVED", "COMPLETED")).toBe(false);
    expect(allowedWarrantyTransition("READY", "RECEIVED")).toBe(false);
  });
  it("rejects private notes at customer projection boundary", () => expect(customerProgressSchema.safeParse({ id: command.id, status: "RECEIVED", customerNote: "Đã nhận", updatedAt: "2026-09-12T00:00:00Z", history: [], privateNote: "secret" }).success).toBe(false));
});
