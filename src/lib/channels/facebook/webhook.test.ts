import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createFacebookWebhook, type PersistFacebookEvents } from "./webhook";
const secret = "fixture-app-secret";
const pageId = "10000000001";
const body = JSON.stringify({ object: "page", entry: [{ id: pageId, time: 1700000000, messaging: [{ sender: { id: "20000000001" }, recipient: { id: pageId }, timestamp: 1700000000000, message: { mid: "mid.fake1", text: "fixture message" } }] }] });
function post(raw = body, signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`) { return new Request("https://fixture.invalid/api/webhooks/facebook", { method: "POST", body: raw, headers: { "x-hub-signature-256": signature } }); }
const factory = (persist = vi.fn<PersistFacebookEvents>(async () => {})) => ({ persist, handlers: createFacebookWebhook({ appSecret: secret, verifyToken: "verify-fixture", pageId, persist }) });
afterEach(() => vi.useRealTimers());
it("verifies GET token and returns challenge verbatim", async () => {
 const { handlers } = factory();
 const result = await handlers.GET(new Request("https://fixture.invalid/?hub.mode=subscribe&hub.verify_token=verify-fixture&hub.challenge=12345"));
 expect(result.status).toBe(200); expect(await result.text()).toBe("12345");
 expect((await handlers.GET(new Request("https://fixture.invalid/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"))).status).toBe(403);
});
it("rejects missing or invalid signatures before JSON parsing", async () => {
 const { handlers, persist } = factory();
 expect((await handlers.POST(post("not JSON", ""))).status).toBe(401);
 expect((await handlers.POST(post(body, "sha256=00"))).status).toBe(401);
 expect(persist).not.toHaveBeenCalled();
});
it("persists authenticated normalized input before ACK", async () => {
 const { handlers, persist } = factory();
 expect((await handlers.POST(post())).status).toBe(200);
 expect(persist).toHaveBeenCalledOnce();
 expect(persist.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ kind: "message", pageId, eventTimeMs: 1700000000000, data: { text: "fixture message" } })]);
});
it("rejects wrong Page and signed malformed JSON", async () => {
 const { handlers, persist } = factory();
 expect((await handlers.POST(post(body.replaceAll(pageId, "99999999999")))).status).toBe(403);
 expect((await handlers.POST(post("{"))).status).toBe(400);
 expect(persist).not.toHaveBeenCalled();
});
it("does not ACK storage failures or hang beyond the ACK budget", async () => {
 vi.useFakeTimers();
 const { handlers } = factory(vi.fn(() => new Promise<void>(() => {})));
 const pending = handlers.POST(post());
 await vi.advanceTimersByTimeAsync(4500);
 expect((await pending).status).toBe(503);
});
it("rejects body size beyond 1MiB", async () => {
 const { handlers } = factory();
 expect((await handlers.POST(post(" ".repeat(1048577)))).status).toBe(413);
});
it("preserves echoes, attachment metadata, postbacks, referrals and comment edit identity", async () => {
 const event = (message: unknown) => ({ sender: { id: "20000000001" }, recipient: { id: pageId }, timestamp: 1700000000000, ...message as object });
 const payload = { object: "page", entry: [{ id: pageId, time: 1700000001, messaging: [
  event({ message: { mid: "attachment.fake", attachments: [{ type: "image", payload: { url: "https://fixture.invalid/image.jpg", secretUnknown: "discard" } }], unknown: "discard" } }),
  { sender: { id: pageId }, recipient: { id: "20000000001" }, timestamp: 1700000000000, message: { mid: "echo.fake", is_echo: true, text: "outbound fixture" } },
  event({ postback: { title: "Fixture", payload: "fixture-action" } }), event({ referral: { ref: "fixture-ref", source: "SHORTLINK" } }),
 ], changes: [
  { field: "feed", value: { item: "comment", verb: "add", comment_id: "fake_comment", message: "first", created_time: 1700000000 } },
  { field: "feed", value: { item: "comment", verb: "edited", comment_id: "fake_comment", message: "edited", created_time: 1700000001 } },
 ] }] };
 const { handlers, persist } = factory();
 expect((await handlers.POST(post(JSON.stringify(payload)))).status).toBe(200);
 const events = persist.mock.calls[0]?.[0];
 expect(events?.map((event: { kind: string }) => event.kind)).toEqual(["message", "echo", "postback", "referral", "comment", "comment"]);
 expect(JSON.stringify(events)).not.toContain("discard");
 expect(events?.[4]?.providerKey).not.toBe(events?.[5]?.providerKey);
});
it("keeps message dedup stable across delivery timestamps and accepts older events", async () => {
 const { handlers, persist } = factory();
 await handlers.POST(post()); await handlers.POST(post(body.replace('"time":1700000000', '"time":1700001000')));
 expect(persist.mock.calls[0]?.[0]?.[0]?.providerKey).toBe(persist.mock.calls[1]?.[0]?.[0]?.providerKey);
 expect((await handlers.POST(post(body.replaceAll("1700000000000", "1600000000000").replace("mid.fake1", "mid.older")))).status).toBe(200);
});
it("bounds raw-body reading and cancels a stalled stream", async () => {
 vi.useFakeTimers();
 const { handlers } = factory();
 const cancel = vi.fn();
 const request = new Request("https://fixture.invalid", { method: "POST", body: new ReadableStream({ cancel }), duplex: "half", headers: { "x-hub-signature-256": `sha256=${"0".repeat(64)}` } } as RequestInit);
 const pending = handlers.POST(request);
 await vi.advanceTimersByTimeAsync(4000);
 expect((await pending).status).toBe(503); expect(cancel).toHaveBeenCalled();
});

it("deduplicates rebatches without treating delivery time as action time", async () => {
 const payload = { object: "page", entry: [{ id: pageId, time: 1700000000, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "fake_comment", message: "fixture" } }] }] };
 const { handlers, persist } = factory();
 await handlers.POST(post(JSON.stringify(payload)));
 payload.entry[0].time = 1700000100;
 await handlers.POST(post(JSON.stringify(payload)));
 expect(persist.mock.calls[0]?.[0]?.[0]?.providerKey).toBe(persist.mock.calls[1]?.[0]?.[0]?.providerKey);
 expect(persist.mock.calls[0]?.[0]?.[0]?.eventTimeMs).toBeNull();
});
it("rejects actionable messages without a sender identity", async () => {
 const payload = JSON.parse(body); delete payload.entry[0].messaging[0].sender;
 expect((await factory().handlers.POST(post(JSON.stringify(payload)))).status).toBe(400);
});
it("returns retryable503 for a failed write without disclosing provider errors", async () => {
 const { handlers } = factory(vi.fn(async () => { throw new Error("fixture-private-provider-body"); }));
 const result = await handlers.POST(post());
 expect(result.status).toBe(503); expect(await result.text()).not.toContain("fixture-private");
});
it("authenticates exact raw bytes including whitespace", async () => {
 const { handlers } = factory();
 const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
 expect((await handlers.POST(post(` ${body}`, signature))).status).toBe(401);
 expect((await handlers.POST(post(` ${body}`))).status).toBe(200);
});
it("rejects an oversized normalized event before attempting storage", async () => {
 const payload = JSON.parse(body);
 payload.entry[0].messaging[0].message.text = "界".repeat(16000);
 payload.entry[0].messaging[0].message.attachments = Array.from({ length: 20 }, () => ({ type: "image", payload: { url: `https://fixture.invalid/${"a".repeat(2000)}` } }));
 const raw = JSON.stringify(payload);
 expect(Buffer.byteLength(raw)).toBeLessThan(1048576);
 const { handlers, persist } = factory();
 expect((await handlers.POST(post(raw))).status).toBe(413);
 expect(persist).not.toHaveBeenCalled();
});
it("rejects a normalized batch that grows past the RPC byte budget", async () => {
 const raw = JSON.stringify({ object: "page", entry: [{ id: pageId, time: 1700000000, changes: Array.from({ length: 1000 }, (_, index) => ({ field: "feed", value: { item: "comment", verb: "add", comment_id: `fixture_${index}`, message: "x".repeat(800) } })) }] });
 expect(Buffer.byteLength(raw)).toBeLessThan(1048576);
 const { handlers, persist } = factory();
 expect((await handlers.POST(post(raw))).status).toBe(413);
 expect(persist).not.toHaveBeenCalled();
});
