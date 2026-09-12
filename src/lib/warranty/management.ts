// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid } from "@/lib/jobs/types";
const id = postgresUuid.transform(value => value.toLowerCase());
export const warrantyStatuses = ["RECEIVED", "INSPECTING", "IN_SERVICE", "READY", "COMPLETED"] as const;
export type WarrantyStatus = typeof warrantyStatuses[number];
const status = z.enum(warrantyStatuses);
const note = z.string().trim().max(4000).refine(value => !/<\/?[a-z][^>]*>/i.test(value) && ![...value].some(char => char.charCodeAt(0) < 32 && !"\n\r\t".includes(char)), "Chỉ nhập văn bản thuần.");
export const warrantyCommandSchema = z.strictObject({ id, requestId: id, expectedVersion: z.number().int().min(0).max(2147483646), orderId: id, lineNumber: z.number().int().min(1).max(100), status, customerNote: note, privateNote: note });
export type WarrantyCommand = z.infer<typeof warrantyCommandSchema>;
export function allowedWarrantyTransition(from: WarrantyStatus, to: WarrantyStatus) { return to === from || warrantyStatuses.indexOf(to) === warrantyStatuses.indexOf(from) + 1; }
const publicHistory = z.strictObject({ version: z.number().int().positive(), status, customerNote: z.string(), createdAt: z.string() });
export const customerProgressSchema = z.strictObject({ id, status, customerNote: z.string(), updatedAt: z.string(), history: z.array(publicHistory) });
export const warrantyRecordSchema = z.object({ id, orderId: id, lineNumber: z.number().int(), version: z.number().int().positive(), status, customerNote: z.string(), privateNote: z.string(), buyerName: z.string().nullable(), productName: z.string(), sku: z.string().nullable(), updatedAt: z.string(), history: z.array(publicHistory.extend({ privateNote: z.string() })) });
export type WarrantyRecord = z.infer<typeof warrantyRecordSchema>;
export const warrantyPageSchema = z.object({ items: z.array(warrantyRecordSchema), total: z.number(), page: z.number() });
export type WarrantyPage = z.infer<typeof warrantyPageSchema>;
export const eligibleItemsSchema = z.array(z.object({ orderId: id, lineNumber: z.number(), buyerName: z.string().nullable(), productName: z.string(), sku: z.string().nullable(), quantity: z.number(), orderedAt: z.string() }));
export type EligibleItem = z.infer<typeof eligibleItemsSchema>[number];
export const warrantyQuerySchema = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1), search: z.string().trim().max(100).default("") });
