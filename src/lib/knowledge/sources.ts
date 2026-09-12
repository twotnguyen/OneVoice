// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** Registry screening only. The ingestion adapter must resolve/revalidate DNS and redirects. */
export function isCandidateSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && !url.username && !url.password &&
      host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':') &&
      !/(^|\.)(localhost|local|localdomain|internal|lan|home)$/.test(host);
  } catch { return false; }
}
export const sourceDocumentSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['text', 'html']),
  text: z.string().trim().max(20000).nullable(),
  url: z.string().max(2048).refine(isCandidateSourceUrl, 'Cần URL HTTPS công khai, không chứa thông tin đăng nhập.').transform(value => {
    const url = new URL(value); url.hostname = url.hostname.replace(/\.$/, ''); return url.href;
  }).refine(value => value.length <= 2048, 'Liên kết quá dài.').nullable(),
  authority: z.enum(['business', 'reference']),
  productIds: z.array(z.string().uuid()).max(100),
  topics: z.array(z.string().trim().min(1).max(120)).max(30),
  freshnessHours: z.number().int().min(1).max(720),
  active: z.boolean(),
}).superRefine((value, context) => {
  if (value.kind === 'text' ? !value.text || value.url !== null : !value.url || value.text !== null)
    context.addIssue({ code: 'custom', path: [value.kind === 'text' ? 'text' : 'url'], message: 'Nguồn chỉ có nội dung văn bản hoặc URL theo loại đã chọn.' });
  if (new Set(value.productIds).size !== value.productIds.length)
    context.addIssue({ code: 'custom', path: ['productIds'], message: 'Sản phẩm bị trùng.' });
});
export const sourceCommandSchema = z.strictObject({
  id: z.string().uuid(), requestId: z.string().uuid(), expectedVersion: z.number().int().min(0).max(2147483646), document: sourceDocumentSchema,
});
export const sourceQuerySchema = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type SourceCommand = z.infer<typeof sourceCommandSchema>;
export type SourceRecord = { id: string; version: number; document: SourceDocument; updatedAt: string };
export type SourcePage = { items: SourceRecord[]; total: number; page: number; pageSize: number };
export function defaultSource(): SourceDocument {
  return { name: '', kind: 'text', text: '', url: null, authority: 'business', productIds: [], topics: [], freshnessHours: 24, active: true };
}
/** Version/freshness gate for OV-050/016. Registry edits never silently reuse older evidence. */
export function sourceIsCurrent(source: Pick<SourceRecord, 'version' | 'document'>, ingestion: { version: number; fetchedAt: string }, now: number): boolean {
  const fetched = Date.parse(ingestion.fetchedAt);
  return source.document.active && source.version === ingestion.version && Number.isFinite(now) && Number.isFinite(fetched) && fetched <= now && now - fetched < source.document.freshnessHours * 3600000;
}
