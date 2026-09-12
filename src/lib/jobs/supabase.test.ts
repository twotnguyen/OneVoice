import { expect, it } from "vitest";
import { createBusinessJobQueue } from "./supabase";
it("normalizes database exceptions without retaining provider bodies", async () => {
 const queue = createBusinessJobQueue(async () => ({ data: null, error: { message: "customer secret" } }));
 await expect(queue.claim("00000000-0000-4000-8000-000000000001")).rejects.toThrow(/^job_store_failed$/);
});
it("decodes empty claims", async () => {
 const queue = createBusinessJobQueue(async () => ({ data: [], error: null }));
 expect(await queue.claim("00000000-0000-4000-8000-000000000001")).toBeNull();
});
it("normalizes thrown transport errors", async () => {
 const queue = createBusinessJobQueue(async () => { throw new Error("secret transport body"); });
 await expect(queue.claim("00000000-0000-4000-8000-000000000001")).rejects.toThrow(/^job_store_failed$/);
});
it("enqueues and decodes the existing PostgreSQL organization UUID", async () => {
 const id = "a0000000-0000-0000-0000-000000000001";
 const queue = createBusinessJobQueue(async (name) => ({ data: name === "enqueue_business_job" ? id : [{ id, organization_id: id, entity_id: id, kind: "inbound_event", lease_owner: id, lease_token: id }], error: null }));
 expect(await queue.enqueue({ organizationId: id, kind: "inbound_event", entityId: id, dedupKey: id, availableAt: "2040-01-01T00:00:00Z" })).toBe(id);
 expect(await queue.claim(id)).toEqual({ id, organization_id: id, entity_id: id, kind: "inbound_event", lease_owner: id, lease_token: id });
});
