// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
const plain = (max: number) => z.string().trim().min(1).max(max).refine(value => !/<\/?[a-z][^>]*>/i.test(value) && ![...value].some(char => char.charCodeAt(0) < 32 && !"\n\r\t".includes(char)), "Chỉ nhập văn bản, không HTML hoặc ký tự điều khiển.");
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).nullable();
export const knowledgeDocumentSchema = z.strictObject({
  kind: z.enum(["return", "warranty", "service", "promotion"]), title: plain(200), body: plain(10000),
  startsAt: instant, expiresAt: instant, active: z.boolean(),
  scope: z.enum(["all", "products"]),
  productIds: z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length),
  discountType: z.string().trim().min(1).max(64).nullable(), discountValue: z.number().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
}).superRefine((value, ctx) => {
  if (value.startsAt && value.expiresAt && value.startsAt >= value.expiresAt) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Thời điểm kết thúc phải sau bắt đầu." });
  if (value.scope === "products" && !value.productIds.length) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Chọn ít nhất một sản phẩm trong phạm vi." });
  if (value.scope === "all" && value.productIds.length) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Phạm vi toàn doanh nghiệp không chứa danh sách sản phẩm riêng." });
  if (value.kind !== "promotion" && (value.discountType !== null || value.discountValue !== null)) ctx.addIssue({ code: "custom", path: ["discountType"], message: "Chính sách không chứa mức giảm giá." });
  if (value.discountType === "percent" && value.discountValue !== null && value.discountValue > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Phần trăm tối đa 100." });
  if (value.discountType === "fixed" && value.discountValue !== null && !Number.isInteger(value.discountValue)) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Tiền VND phải là số nguyên." });
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export const knowledgeCommandSchema = z.strictObject({ id: z.string().uuid(), requestId: z.string().uuid(), expectedVersion: z.number().int().min(0).max(2147483646), document: knowledgeDocumentSchema });
export type KnowledgeCommand = z.infer<typeof knowledgeCommandSchema>;
export type KnowledgeRecord = { id: string; version: number; document: KnowledgeDocument; source: string | null };
export type KnowledgePage = { items: KnowledgeRecord[]; total: number; page: number; pageSize: number };
export const knowledgeQuerySchema = z.strictObject({ kind: z.enum(["policy", "promotion"]).default("policy"), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), search: z.string().trim().max(100).default("") });
export function isEffective(value: Pick<KnowledgeDocument, "active" | "startsAt" | "expiresAt">, at: Date): boolean {
  return value.active && (!value.startsAt || Date.parse(value.startsAt) <= at.getTime()) && (!value.expiresAt || at.getTime() < Date.parse(value.expiresAt));
}
