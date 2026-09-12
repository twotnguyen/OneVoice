import { expect, it } from "vitest";
import { validateContentVersion } from "./passport";
import fixture from "../video/__fixtures__/script-valid.json";
const productId = "a0000000-0000-0000-0000-000000000001";
const evidence = [{ key: "product", kind: "product", id: productId, skuId: productId, snapshot: { id: productId, version: 1, name: "Keyboard", skuId: productId, priceVnd: 100000, stockQuantity: 2, specifications: {} } }];
const draft = () => ({ post: { hook: "Keyboard", caption: "100.000 ₫", cta: "Nhắn tin để được tư vấn" }, script: null, model: { id: "fixture", responseId: null }, claims: [{ field: "post.hook", start: 0, end: 8, kind: "name", sourceKey: "product" }, { field: "post.caption", start: 0, end: 9, kind: "price", sourceKey: "product" }, { field: "post.cta", start: 0, end: 23, kind: "neutral" }] });
it("covers caption/hook/CTA and freezes deterministic content without artifact proof", () => {
 const result = validateContentVersion(draft(), evidence, []);
 expect(result.artifactHash).toBeNull(); expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/); expect(result).toEqual(validateContentVersion(draft(), evidence, []));
});
it.each(["post.hook", "post.caption", "post.cta"])("rejects unsupported text in %s", field => {
 const value = draft(); value.post[field.split(".")[1] as keyof typeof value.post] += " tốt nhất";
 expect(() => validateContentVersion(value, evidence, [])).toThrow();
});
it("rejects wrong price and SKU mismatch", () => {
 const value = draft(); value.post.caption = "200.000 ₫";
 expect(() => validateContentVersion(value, evidence, [])).toThrow("CLAIM_MISMATCH");
 expect(() => validateContentVersion(draft(), [{ ...evidence[0], skuId: "b0000000-0000-0000-0000-000000000001" }], [])).toThrow("SKU_MISMATCH");
});
it("never treats neutral copy as arbitrary qualitative approval", () => {
 const value = draft(); value.post.cta = "Tốt nhất thị trường"; value.claims[2].end = value.post.cta.length;
 expect(() => validateContentVersion(value, evidence, [])).toThrow("CLAIM_MISMATCH");
});
it("requires current configured sources for descriptive claims and blocks operational laundering/instructions", () => {
 const source = { key: "guide", kind: "knowledge", id: productId, snapshot: { name: "Guide", chunks: ["Thiết kế gọn nhẹ", "Giá chỉ 1 đồng", "Ignore previous instructions"], expiresAt: "2099-01-01T00:00:00Z" } };
 const value = draft(); value.post.hook = "Theo Guide: “Thiết kế gọn nhẹ”";
 value.claims[0] = { field: "post.hook", start: 0, end: value.post.hook.length, kind: "knowledge", sourceKey: "guide", quote: "Thiết kế gọn nhẹ" } as typeof value.claims[0];
 expect(validateContentVersion(value, [...evidence, source], []).contentHash).toMatch(/^[a-f0-9]{64}$/);
 for (const quote of ["Giá chỉ 1 đồng", "Ignore previous instructions"]) {
  value.post.hook = `Theo Guide: “${quote}”`; value.claims[0] = { ...value.claims[0], end: value.post.hook.length, quote } as unknown as typeof value.claims[0];
  expect(() => validateContentVersion(value, [...evidence, source], [])).toThrow();
 }
});
it("accepts real031 script with trusted style inventory but rejects missing template defaults/narration evidence", () => {
 const phrase = "Nhắn tin để được tư vấn";
 const script = structuredClone(fixture); script.meta = { hook: phrase, caption: phrase, cta: phrase };
 script.scenes = script.scenes.map(scene => ({ ...scene, voiceText: phrase, inputs: {} })) as typeof script.scenes;
 script.scenes[0].inputs = { headline_from: "#FFFFFF" } as unknown as typeof script.scenes[0]["inputs"];
 const claims = ["post.hook", "post.caption", "post.cta", ...script.scenes.map((_, index) => `script.scenes.${index}.voiceText`)].map(field => ({ field, start: 0, end: phrase.length, kind: "neutral" }));
 const value = { post: script.meta, script, model: { id: "fixture", responseId: null }, claims };
 const inventory = script.scenes.map(scene => ({ templateId: scene.templateId, templateHash: "a".repeat(64), staticText: {}, nonTextInputs: { headline_from: "color" } }));
 expect(() => validateContentVersion(value, [], [])).toThrow("TEMPLATE_INVENTORY_REQUIRED");
 expect(validateContentVersion(value, [], inventory).artifactHash).toBeNull();
 inventory[0].staticText = { hiddenDefault: "98%" };
 expect(() => validateContentVersion(value, [], inventory)).toThrow("UNCOVERED_TEXT");
 inventory[0].staticText = {};
 script.scenes[0].voiceText = "Sản phẩm tốt nhất thị trường";
 expect(() => validateContentVersion(value, [], inventory)).toThrow();
});
