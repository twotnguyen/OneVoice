// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).nullable();
const price = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const quantity = z.number().int().min(0).max(2147483647).nullable();
export const externalImageSchema = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Ảnh cần URL HTTPS không chứa tài khoản.");
const image = z.object({ id: z.uuid(), url: externalImageSchema, altText: text(300) }).strict();
const variant = z.object({ id: z.uuid(), name: text(300), sku: text(100), priceVnd: price, stockQuantity: quantity, inStock: z.boolean().nullable(), active: z.boolean(), imageUrl: externalImageSchema.nullable() }).strict();
export const managementDocumentSchema = z.object({
  name: z.string().trim().min(1).max(300), sku: text(100), brand: text(100),
  productType: z.string().trim().min(1).max(100), descriptionText: text(10000),
  priceVnd: price, stockQuantity: quantity, inStock: z.boolean(), active: z.boolean(),
  specifications: z.array(z.object({ name: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(2000) }).strict()).max(100),
  images: z.array(image).max(30), variants: z.array(variant).max(100),
}).strict().refine((value) => new Set(value.images.map((item) => item.id)).size === value.images.length &&
  new Set(value.images.map((item) => item.url)).size === value.images.length &&
  new Set(value.variants.map((item) => item.id)).size === value.variants.length, "ID hoặc URL bị trùng.")
  .refine((value) => value.variants.filter((item) => item.active).reduce((sum, item) => sum + (item.stockQuantity ?? 0), 0) <= 2147483647, "Tổng tồn phiên bản vượt giới hạn lưu trữ.")
  .transform((value) => ({ ...value, inStock: value.stockQuantity === 0 ? false : value.inStock,
    variants: value.variants.map((item) => ({ ...item, inStock: item.stockQuantity === 0 ? false : item.inStock })),
  }));
export const managementCommandSchema = z.object({
  requestId: z.uuid(), productId: z.uuid(), expectedVersion: z.number().int().min(0).max(2147483646), document: managementDocumentSchema,
}).strict();
export const managementListSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""), productType: z.string().trim().min(1).max(100).optional(),
  active: z.enum(["all", "active", "disabled"]).default("all"),
}).strict();
export type ManagementDocument = z.infer<typeof managementDocumentSchema>;
export type ManagementCommand = z.infer<typeof managementCommandSchema>;
export type ManagementListQuery = z.infer<typeof managementListSchema>;
export type ManagedProduct = { id: string; version: number; document: ManagementDocument; sourceName: string | null; sourceUrl: string; sourceProductId: string | null; editedAt: string | null };
export type ManagementListResult = { items: Array<{ id: string; name: string; sku: string | null; productType: string | null; priceVnd: number | null; stockQuantity: number | null; active: boolean; version: number; sourceName: string | null }>; total: number; page: number; pageSize: number };
