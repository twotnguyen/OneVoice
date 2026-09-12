import { expect, it } from "vitest";
import { manualCampaignSchema } from "./management";
import { validateCampaignDecision } from "./decision";
import { rankOpportunities } from "../opportunities/engine";
import { defaultSettings } from "../business/settings";
const id = "a0000000-0000-0000-0000-000000000001";
it("permits a PostgreSQL organization-independent manual source command", () => { expect(manualCampaignSchema.parse({ id, requestId: id, expectedControlRevision: 0, sourceKind: "product", sourceId: id, objective: "mixed" }).sourceId).toBe(id); });
it.each([{ price: 1 }, { contentVersionId: id }, { scheduledAt: "now" }, { actorId: id }])("rejects injected fields %j", patch => { expect(manualCampaignSchema.safeParse({ id, requestId: id, expectedControlRevision: 0, sourceKind: "product", sourceId: id, objective: "mixed", ...patch }).success).toBe(false); });
it("keeps the complete frozen opportunity and rejects altered digest", async () => {
 const now = new Date(); const decision = await rankOpportunities({ organizationId: id, capturedAt: now.toISOString(), settings: defaultSettings(), products: [], programs: [], trends: null, recent: [], performance: null }, { now: () => now });
 expect(() => validateCampaignDecision(decision)).toThrow("NO_SELECTION");
 const altered = { ...decision, inputDigest: "0".repeat(64), selectedKey: "invented" }; expect(() => validateCampaignDecision(altered)).toThrow();
});
it("validates every operational field before a trusted worker can call SQL", async () => {
 const now = new Date();
 const decision = await rankOpportunities({ organizationId: id, capturedAt: now.toISOString(), settings: defaultSettings(), products: [{ id, organizationId: id, version: 1, name: "Fixture", productType: null, active: true, priceVnd: 100, stockQuantity: 2, inStock: true, variants: [] }], programs: [], trends: null, recent: [], performance: null }, { now: () => now });
 expect(validateCampaignDecision(decision)).toEqual(decision);
 for (const operational of [{}, { skus: [], programs: null }, { skus: [{ id, priceVnd: -1, stockQuantity: 2 }], programs: [] }]) {
  const malformed = { ...decision, ranked: decision.ranked.map(candidate => ({ ...candidate, operational })) };
  expect(() => validateCampaignDecision(malformed)).toThrow();
 }
});
