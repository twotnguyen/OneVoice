import { expect, it } from "vitest";
import { defaultSettings } from "../business/settings";
import { rankOpportunities, type OpportunityInput } from "./engine";
const now = new Date("2026-09-12T10:00:00Z");
const org = "a0000000-0000-0000-0000-000000000001";
const productId = "b0000000-0000-4000-8000-000000000029";
function fixture(): OpportunityInput { return { organizationId: org, capturedAt: now.toISOString(), settings: defaultSettings(), products: [{ id: productId, organizationId: org, version: 1, name: "Bàn phím", productType: "keyboard", active: true, priceVnd: 500000, stockQuantity: 2, inStock: true, variants: [] }], programs: [], trends: null, recent: [], performance: null }; }
it("freezes explained rule inputs, source versions and unavailable performance", async () => {
 const input = fixture(); const result = await rankOpportunities(input, { now: () => now });
 expect(result.selectedKey).toBe(`product:${productId}`); expect(result.snapshot.performance).toBeNull(); expect(result.algorithmVersion).toBe("ov029-v1");
 expect(result.ranked[0].components.performance).toBeNull(); expect(result.ranked[0].components.objective).toBeCloseTo(21.666667); expect(result.snapshot.products[0].version).toBe(1);
 input.products[0].name = "Changed"; expect(result.snapshot.products[0].name).toBe("Bàn phím"); expect(Object.isFrozen(result.snapshot.products[0])).toBe(true);
});
it("does not use a product stock bucket when variants exist", async () => {
 const input = fixture(); input.products[0].variants = [{ id: "c0000000-0000-4000-8000-000000000029", name: "Red", active: true, priceVnd: 10, stockQuantity: 0, inStock: false }];
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
});
it("excludes expired programs, stale snapshots, foreign facts and recent picks", async () => {
 const input = fixture(); input.recent = [{ key: `product:${productId}`, pickedAt: now.toISOString() }];
 input.programs = [{ id: "d0000000-0000-4000-8000-000000000029", version: 2, title: "Sale", body: "A program", active: true, startsAt: null, expiresAt: now.toISOString(), scope: "all", productIds: [], discountType: "percent", discountValue: 10 }];
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
 input.capturedAt = "2026-09-12T09:00:00Z"; await expect(rankOpportunities(input, { now: () => now })).rejects.toThrow("STALE_INPUT");
 input.capturedAt = now.toISOString(); input.products[0].organizationId = "a0000000-0000-0000-0000-000000000002"; await expect(rankOpportunities(input, { now: () => now })).rejects.toThrow("FOREIGN_FACT");
});
it("requires verified manager goal alignment and rejects AI-invented candidates", async () => {
 const input = fixture(); input.settings.settings.goalSelection = "manager"; input.settings.settings.managerGoal = "Bàn phím cho văn phòng";
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
 const ai = { generateText: async () => ({ model: "fake", text: JSON.stringify({ assessments: [{ candidateKey: `product:${productId}`, relevance: 0.8, managerGoalMatch: true, explanation: "Phù hợp mục tiêu bàn phím." }] }) }) };
 expect((await rankOpportunities(input, { now: () => now, ai })).selectedKey).toBe(`product:${productId}`);
 ai.generateText = async () => ({ model: "fake", text: JSON.stringify({ assessments: [{ candidateKey: "invented", relevance: 1, managerGoalMatch: true, explanation: "Invented" }] }) });
 expect((await rankOpportunities(input, { now: () => now, ai })).selectedKey).toBeNull();
});
function withTrend(topic = "Công nghệ mới"): OpportunityInput {
 const input = fixture(); input.products = []; input.settings.settings.objective = "engagement"; input.settings.settings.allowedTopics = ["công nghệ"];
 input.trends = { runId: "e0000000-0000-4000-8000-000000000029", batch: { observedAt: "2026-09-12T09:45:01Z", capabilities: { news: "available", social: "unconfigured", facebook: "unavailable" }, sources: [{ key: "news", kind: "rss_news", url: "https://example.invalid/feed", ttlSeconds: 900, status: "success", errorCode: null, observations: [{ fingerprint: "test", topic, url: "https://example.invalid/article", sourceTimestamp: "2026-09-12T09:59:00Z", timestampKind: "published", expiresAt: "2026-09-12T10:10:00Z", trust: "untrusted_external", metrics: null }] }] } };
 return input;
}
it("allows engagement-only trends with explicit brand match and gives banned topics precedence", async () => {
 const input = withTrend(); const result = await rankOpportunities(input, { now: () => now });
 expect(result.ranked[0].kind).toBe("trend"); expect(result.ranked[0].operational).toBeNull(); expect(result.snapshot.trends?.batch.sources[0].observations[0].metrics).toBeNull();
 input.settings.settings.forbiddenTopics = ["mới"]; expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
 input.settings.settings.forbiddenTopics = []; input.settings.settings.allowedTopics = []; expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
});
it("expires the source TTL during AI ranking even when the observation TTL is later", async () => {
 const input = withTrend(); let calls = 0;
 const result = await rankOpportunities(input, { now: () => calls++ ? new Date("2026-09-12T10:00:02Z") : now, ai: { generateText: async () => ({ model: "synthetic", text: '{"assessments":[]}' }) } });
 expect(result.selectedKey).toBeNull(); expect(result.excluded.some(item => item.reason === "EVIDENCE_EXPIRED_DURING_RANKING")).toBe(true);
});
it("does not attach a forbidden program to a safe product", async () => {
 const input = fixture(); input.settings.settings.forbiddenTopics = ["cá cược"];
 input.programs = [{ id: "d0000000-0000-4000-8000-000000000029", version: 1, title: "Cá cược", body: "Banned topic", active: true, startsAt: null, expiresAt: null, scope: "all", productIds: [], discountType: null, discountValue: null }];
 const result = await rankOpportunities(input, { now: () => now }); expect(result.ranked[0].components.program).toBe(0); expect(result.ranked[0].evidence).toHaveLength(1);
});
it.each([{ stockQuantity: 0 }, { stockQuantity: null }, { priceVnd: null }, { priceVnd: 0 }, { active: false }])("fails closed on unavailable catalog facts %j", async patch => {
 const input = fixture(); Object.assign(input.products[0], patch); expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
});
it("keeps overlapping programs separate and uses the inclusive start boundary", async () => {
 const input = fixture(); input.products = []; input.programs = ["d0000000-0000-4000-8000-000000000029", "d0000000-0000-4000-8000-000000000030"].map(id => ({ id, version: 1, title: "Active program", body: "Terms", active: true, startsAt: now.toISOString(), expiresAt: "2026-09-13T00:00:00Z", scope: "all", productIds: [], discountType: "percent", discountValue: 10 }));
 const result = await rankOpportunities(input, { now: () => now }); expect(result.ranked).toHaveLength(2); expect(result.ranked.map(item => (item.operational as { discountValue: number }).discountValue)).toEqual([10, 10]);
});
it("does not label external instance metrics as business performance", async () => {
 const input = withTrend(); input.trends!.batch.sources[0].observations[0].metrics = { scope: "mastodon_instance", instance: "example.invalid", history: [{ day: "2026-09-12T00:00:00Z", uses: 500, accounts: 300 }] };
 const result = await rankOpportunities(input, { now: () => now }); expect(result.performanceStatus).toBe("unavailable"); expect(result.ranked[0].components.performance).toBeNull(); expect(result.ranked[0].score).toBe(30);
});
it("deduplicates recent trend topics even when upstream metrics change the fingerprint", async () => {
 const input = withTrend(); const first = await rankOpportunities(input, { now: () => now }); input.recent = [{ key: first.selectedKey!, pickedAt: now.toISOString() }]; input.trends!.batch.sources[0].observations[0].fingerprint = "changed-metrics";
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBeNull();
});
it("accepts valid fractional percent and legacy discounts, including expired rows", async () => {
 const input = fixture(); input.programs = [{ id: "d0000000-0000-4000-8000-000000000029", version: 1, title: "Fractional percent", body: "Terms", active: true, startsAt: null, expiresAt: null, scope: "all", productIds: [], discountType: "percent", discountValue: 12.5 }];
 expect((await rankOpportunities(input, { now: () => now })).ranked[0].components.program).toBe(10);
 input.programs[0].expiresAt = "2000-01-01T00:00:00Z";
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBe(`product:${productId}`);
 input.programs[0].discountType = "legacy";
 expect((await rankOpportunities(input, { now: () => now })).selectedKey).toBe(`product:${productId}`);
 input.programs[0].discountType = "fixed";
 await expect(rankOpportunities(input, { now: () => now })).rejects.toThrow();
 input.programs[0].discountType = "percent"; input.programs[0].discountValue = 101;
 await expect(rankOpportunities(input, { now: () => now })).rejects.toThrow();
});
