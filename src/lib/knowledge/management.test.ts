import { describe, expect, it } from "vitest";
import { knowledgeCommandSchema, isEffective } from "./management";
const document = { kind: "return", title: "Đổi trả", body: "Liên hệ cửa hàng để được hỗ trợ.", startsAt: "2026-09-12T09:00:00+07:00", expiresAt: "2026-09-13T09:00:00+07:00", active: true, scope: "all", productIds: [], discountType: null, discountValue: null };
const command = (patch = {}) => ({ id: "c0000000-0000-4000-8000-000000000011", requestId: "d0000000-0000-4000-8000-000000000011", expectedVersion: 0, document: { ...document, ...patch } });
describe("knowledge management", () => {
  it("normalizes explicit offsets to UTC", () => expect(knowledgeCommandSchema.parse(command()).document.startsAt).toBe("2026-09-12T02:00:00.000Z"));
  it("supports an explicit business-wide promotion without inventing product links", () => {
    const parsed = knowledgeCommandSchema.parse(command({ kind: "promotion", scope: "all", productIds: [] }));
    expect(parsed.document.scope).toBe("all");
    expect(parsed.document.productIds).toEqual([]);
  });
  it.each([{ startsAt: "2026-09-12T09:00:00" }, { expiresAt: "2026-09-12T09:00:00+07:00" }, { body: "<script>alert(1)</script>" }, { kind: "promotion", scope: "products", productIds: [] }, { discountValue: -1 }, { actorId: "untrusted" }])("rejects invalid document %j", patch => expect(knowledgeCommandSchema.safeParse(command(patch)).success).toBe(false));
  it("requires an inclusive start and exclusive expiry", () => {
    const parsed = knowledgeCommandSchema.parse(command()).document;
    expect(isEffective(parsed, new Date("2026-09-12T01:59:59Z"))).toBe(false);
    expect(isEffective(parsed, new Date("2026-09-12T02:00:00Z"))).toBe(true);
    expect(isEffective(parsed, new Date("2026-09-13T02:00:00Z"))).toBe(false);
    expect(isEffective({ ...parsed, active: false }, new Date("2026-09-12T03:00:00Z"))).toBe(false);
  });
});
