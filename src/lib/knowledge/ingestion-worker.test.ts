import { expect, it, vi } from "vitest";
import { createIngestionHandler } from "./ingestion-worker";
import { defaultSource } from "./sources";
const job = { id: "j", organization_id: "org", entity_id: "run", kind: "knowledge_ingest" as const, lease_owner: "owner", lease_token: "token" };
it("publishes normalized source using claim fencing", async () => {
 const port = { load: vi.fn().mockResolvedValue({ id: "source", version: 1, updatedAt: "", document: { ...defaultSource(), name: "Guide", text: "Text" } }), publish: vi.fn().mockResolvedValue(true), fail: vi.fn().mockResolvedValue(true) };
 await createIngestionHandler(port)(job, new AbortController().signal); expect(port.publish).toHaveBeenCalledWith(job, expect.objectContaining({ chunks: ["Text"] }), expect.any(AbortSignal));
});
it("does not publish if source was changed or disabled", async () => { const port = { load: vi.fn().mockResolvedValue(null), publish: vi.fn(), fail: vi.fn().mockResolvedValue(true) }; await createIngestionHandler(port)(job, new AbortController().signal); expect(port.publish).not.toHaveBeenCalled(); });
it("records safe error only and permits bounded job retry", async () => { const port = { load: vi.fn().mockRejectedValue(Error("private DB details")), publish: vi.fn(), fail: vi.fn().mockResolvedValue(true) }; await expect(createIngestionHandler(port)(job, new AbortController().signal)).rejects.toThrow("ingestion_failed"); expect(port.fail).toHaveBeenCalledWith(job, "ingestion_failed"); });
