// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { z } from "zod";
import { postgresUuid } from "../jobs/types";
import { ProductScriptSchema } from "../video/script-schema";
import { isSafeDescriptiveQuote } from "../knowledge/descriptive-policy";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(10000);
export const evidenceSelectorSchema = z.strictObject({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), kind: z.enum(["product", "program", "knowledge", "trend", "brand"]), id: postgresUuid, skuId: postgresUuid.optional(), fingerprint: z.string().min(1).max(128).optional() });
export const evidenceSchema = evidenceSelectorSchema.extend({ snapshot: z.record(z.string(), z.unknown()) });
export type ContentEvidence = z.infer<typeof evidenceSchema>;
const claimSchema = z.strictObject({ field: z.string().max(300), start: z.number().int().nonnegative(), end: z.number().int().positive(), kind: z.enum(["neutral", "name", "price", "stock", "specification", "program", "knowledge", "trend", "brand"]), sourceKey: z.string().max(64).optional(), quote: text.optional(), property: z.string().max(200).optional() });
export const contentDraftSchema = z.strictObject({ post: z.strictObject({ hook: text, caption: text, cta: text }), script: ProductScriptSchema.nullable(), model: z.strictObject({ id: z.string().min(1).max(200), responseId: z.string().max(200).nullable() }), claims: z.array(claimSchema).min(1).max(500) });
/** Trusted renderer inventory, supplied by OV034, never by an AI response.
 * staticText includes every default/static visible string left after substitution.
 * It describes expected text, not a proof that an artifact has been rendered. */
export const templateInventorySchema = z.strictObject({ templateId: z.string().max(100), templateHash: hash, staticText: z.record(z.string().max(100), text), nonTextInputs: z.record(z.string().max(200), z.enum(["color", "index", "mediaUrl"])).default({}) });
export type TemplateInventory = z.infer<typeof templateInventorySchema>;
const NEUTRAL = new Set(["Nhắn tin để được tư vấn", "Xem chi tiết", "Tìm hiểu thêm", "Liên hệ tư vấn", "Thông tin sản phẩm", "Cảm ơn bạn đã theo dõi"]);
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; return JSON.stringify(value); }
export function contentDigest(value: unknown) { return createHash("sha256").update(stable(value)).digest("hex"); }
function expectedClaim(claim: z.infer<typeof claimSchema>, sources: ContentEvidence[], actual: string): string {
 if (claim.kind === "neutral") return NEUTRAL.has(actual) ? actual : "";
 const source = sources.find(item => item.key === claim.sourceKey); if (!source) throw Error("MISSING_EVIDENCE");
 const facts = source.snapshot;
 if (["name", "price", "stock", "specification"].includes(claim.kind)) {
  if (source.kind !== "product") throw Error("WRONG_AUTHORITY");
  if (source.skuId !== facts.skuId) throw Error("SKU_MISMATCH");
  if (claim.kind === "name") return String(facts.name);
  if (claim.kind === "price") return `${new Intl.NumberFormat("vi-VN").format(z.number().int().positive().parse(facts.priceVnd))} ₫`;
  if (claim.kind === "stock") return `Còn ${z.number().int().positive().parse(facts.stockQuantity)} sản phẩm`;
  const specs = z.record(z.string(), z.string()).parse(facts.specifications); const property = claim.property?.trim().toLowerCase(); if (facts.specificationsComplete !== true || !property || !specs[property]) throw Error("MISSING_EVIDENCE"); return `${claim.property}: ${specs[property]}`;
 }
 if (claim.kind === "brand") { if (source.kind !== "brand") throw Error("WRONG_AUTHORITY"); return z.string().parse(facts.brandName); }
 if (claim.kind === "program") { if (source.kind !== "program") throw Error("WRONG_AUTHORITY"); return `${z.string().parse(facts.title)}: ${z.string().parse(facts.body)}`; }
 if (claim.kind === "knowledge") {
  const products = sources.filter(item => item.kind === "product" && Array.isArray(facts.productIds) && facts.productIds.includes(item.id));
  const specs = products.length === 1 ? Object.entries(z.record(z.string(), z.string()).parse(products[0].snapshot.specifications)).map(([name, value]) => ({ name, value })) : [];
  if (source.kind !== "knowledge" || !claim.quote || !isSafeDescriptiveQuote(z.string().parse(facts.name)) || (/\d/.test(claim.quote) && (products.length !== 1 || products[0].snapshot.specificationsComplete !== true || products[0].snapshot.specificationConflicts === true)) || !isSafeDescriptiveQuote(claim.quote, specs) || !z.array(z.string()).parse(facts.chunks).some(chunk => chunk.includes(claim.quote!))) throw Error("UNSUPPORTED_DESCRIPTION");
  return `Theo ${z.string().parse(facts.name)}: “${claim.quote}”`;
 }
 if (source.kind !== "trend" || !isSafeDescriptiveQuote(z.string().parse(facts.topic))) throw Error("WRONG_AUTHORITY");
 return `Chủ đề tham khảo: ${facts.topic}`;
}
/** Complete coverage is deliberately conservative: unsupported prose is rebuilt by
 * OV053, not approved through an unconstrained semantic/AI verdict. */
export function validateContentVersion(raw: unknown, rawEvidence: unknown, rawInventory: unknown) {
 const draft = contentDraftSchema.parse(raw); const evidence = z.array(evidenceSchema).max(50).parse(rawEvidence); const inventory = z.array(templateInventorySchema).max(5).parse(rawInventory);
 if (new Set(evidence.map(item => item.key)).size !== evidence.length || new Set(inventory.map(item => item.templateId)).size !== inventory.length) throw Error("DUPLICATE_EVIDENCE");
 const fields: Record<string, string> = { "post.hook": draft.post.hook, "post.caption": draft.post.caption, "post.cta": draft.post.cta };
 function walk(value: unknown, path: string) { if (typeof value === "string" || typeof value === "number") fields[path] = String(value); else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}.${index}`)); else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`)); }
 if (draft.script) {
  if (JSON.stringify(draft.script.meta) !== JSON.stringify(draft.post)) throw Error("POST_SCRIPT_MISMATCH");
  draft.script.scenes.forEach((scene, index) => {
   const template = inventory.find(item => item.templateId === scene.templateId); if (!template) throw Error("TEMPLATE_INVENTORY_REQUIRED");
   fields[`script.scenes.${index}.voiceText`] = scene.voiceText; walk(scene.inputs, `script.scenes.${index}.inputs`);
   for (const [path, kind] of Object.entries(template.nonTextInputs)) {
    const fullPath = `script.scenes.${index}.inputs.${path}`; const value = fields[fullPath]; if (value === undefined) continue;
    if (kind === "color" && !/^#[a-f0-9]{6}$/i.test(value)) throw Error("INVALID_STYLE");
    if (kind === "index" && (!/(?:^|\.)accent_index$/.test(path) || !/^\d{1,2}$/.test(value))) throw Error("INVALID_STYLE");
    if (kind === "mediaUrl") { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith(".localhost")) throw Error("INVALID_MEDIA_URL"); }
    delete fields[fullPath];
   }
   Object.entries(template.staticText).forEach(([key, value]) => { fields[`script.scenes.${index}.static.${key}`] = value; });
  });
 } else if (inventory.length) throw Error("UNUSED_TEMPLATE");
 for (const claim of draft.claims) if (!(claim.field in fields)) throw Error("UNKNOWN_FIELD");
 for (const [field, value] of Object.entries(fields)) {
  let cursor = 0;
  for (const claim of draft.claims.filter(item => item.field === field).sort((a, b) => a.start - b.start)) {
   if (claim.start < cursor || claim.end <= claim.start || claim.end > value.length || value.slice(cursor, claim.start).trim()) throw Error("UNCOVERED_TEXT");
   const actual = value.slice(claim.start, claim.end); if (expectedClaim(claim, evidence, actual) !== actual) throw Error("CLAIM_MISMATCH"); cursor = claim.end;
  }
  if (value.slice(cursor).trim()) throw Error("UNCOVERED_TEXT");
 }
 const document = { schema: "onevoice.content.v1", draft, evidence, templates: inventory, fields, validation: { status: "VALID", validator: "ov032-v1" }, artifactHash: null } as const;
 if (Buffer.byteLength(JSON.stringify(document)) > 500000) throw Error("CONTENT_TOO_LARGE");
 return { ...document, contentHash: contentDigest(document) };
}
