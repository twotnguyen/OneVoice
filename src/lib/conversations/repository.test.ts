import { expect, it } from "vitest";
import { createConversationRepository, createInboundProjectionHandler } from "./repository";
it("does not project outbound jobs", async () => {
 let calls = 0;
 const repo = createConversationRepository({ rpc: async () => { calls++; return { data: null, error: null }; } });
 const handler = createInboundProjectionHandler(repo);
 await expect(handler({ id: "00000000-0000-4000-8000-000000000001", kind: "outbound_message", organization_id: "a0000000-0000-0000-0000-000000000001", entity_id: "00000000-0000-4000-8000-000000000002", lease_owner: "00000000-0000-4000-8000-000000000003", lease_token: "00000000-0000-4000-8000-000000000004" }, new AbortController().signal)).rejects.toThrow("INVALID_INBOUND_JOB");
 expect(calls).toBe(0);
});
it("normalizes provider failures without retaining private content", async () => {
 const repo = createConversationRepository({ rpc: async () => { throw new Error("private customer fixture"); } });
 await expect(repo.project("a0000000-0000-0000-0000-000000000001", "00000000-0000-4000-8000-000000000001", new AbortController().signal)).rejects.toThrow(/^CONVERSATION_UNAVAILABLE$/);
});
it("preserves durable suppression returned by the projection RPC", async () => {
 const repo = createConversationRepository({ rpc: async () => ({ data: { ignored: false, inserted: false, aiEligible: false, conversation: { id: "00000000-0000-4000-8000-000000000001", organizationId: "a0000000-0000-0000-0000-000000000001", pageId: "10000000014", psid: "20000000014", status: "AI_ACTIVE", revision: 3, activeHandoffId: null, reason: null, claimedBy: null, lastEventTimeMs: 1700000000000 } }, error: null }) });
 const result = await repo.project("a0000000-0000-0000-0000-000000000001", "00000000-0000-4000-8000-000000000001", new AbortController().signal);
 expect(result).toMatchObject({ ignored: false, aiEligible: false, conversation: { status: "AI_ACTIVE" } });
});
it("does not start a projection after cancellation", async () => {
 let calls = 0;
 const repo = createConversationRepository({ rpc: async () => { calls++; return { data: { ignored: true }, error: null }; } });
 const signal = AbortSignal.abort();
 await expect(repo.project("a0000000-0000-0000-0000-000000000001", "00000000-0000-4000-8000-000000000001", signal)).rejects.toThrow("CONVERSATION_ABORTED");
 expect(calls).toBe(0);
});
it("passes only a valid handoff reason and version through the request boundary", async () => {
 let calls = 0;
 const repo = createConversationRepository({ rpc: async () => { calls++; return { data: null, error: null }; } });
 await expect(repo.requestHandoff("a0000000-0000-0000-0000-000000000001", { eventId: "00000000-0000-4000-8000-000000000001", expectedRevision: -1, reason: "customer_requested" }, new AbortController().signal)).rejects.toThrow();
 expect(calls).toBe(0);
});
