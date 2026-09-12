import { expect, it } from "vitest";
import { canComposeStaffWebReply, metaInboxUrl, publicMessage, supportQuery } from "./read";
it("never invents a PSID thread link or exposes tokens", () => {
 expect(metaInboxUrl(undefined, "123")).toBeNull();
 expect(metaInboxUrl("https://business.facebook.com/latest/inbox/all?asset_id=123", "123")).toBe("https://business.facebook.com/latest/inbox/all?asset_id=123");
 expect(metaInboxUrl("https://business.facebook.com/latest/inbox/all?access_token=secret", "123")).toBeNull();
 expect(metaInboxUrl("https://evil.test/latest/inbox/all", "123")).toBeNull();
});
it("exposes only bounded plain message context and safe attachment metadata", () => {
 expect(publicMessage({ text: "<script>fixture</script>", access_token: "secret", attachments: [{ type: "image", url: "javascript:alert(1)", private: "secret" }] })).toEqual({ text: "<script>fixture</script>", attachments: [{ type: "image", url: null }] });
});
it("bounds queue and history pagination inputs", () => {
 expect(supportQuery.safeParse({ limit: 101 }).success).toBe(false);
 expect(supportQuery.safeParse({ status: "unknown" }).success).toBe(false);
});
it("rejects inbox URL paths with an unrecognized suffix",()=>{expect(metaInboxUrl("https://business.facebook.com/latest/inbox/all/unverified-token", "123")).toBeNull();});
it("AT-059-02/03 composer only for WEB STAFF_ACTIVE claimant or manager",()=>{
 const web={channel:"WEB" as const,status:"STAFF_ACTIVE",handoff:{claimedBy:"staff-1"}};
 expect(canComposeStaffWebReply(web,{id:"staff-1",role:"staff"})).toBe(true);
 expect(canComposeStaffWebReply(web,{id:"manager-1",role:"manager"})).toBe(true);
 expect(canComposeStaffWebReply(web,{id:"staff-2",role:"staff"})).toBe(false);
 expect(canComposeStaffWebReply({...web,status:"WAITING_STAFF",handoff:{claimedBy:null}},{id:"staff-1",role:"staff"})).toBe(false);
 expect(canComposeStaffWebReply({channel:"FACEBOOK",status:"STAFF_ACTIVE",handoff:{claimedBy:"staff-1"}},{id:"staff-1",role:"staff"})).toBe(false);
 expect(canComposeStaffWebReply({channel:"FACEBOOK",status:"STAFF_ACTIVE",handoff:{claimedBy:"staff-1"}},{id:"manager-1",role:"manager"})).toBe(false);
});
