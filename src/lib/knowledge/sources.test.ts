import { describe, expect, it } from 'vitest';
import { sourceDocumentSchema, sourceCommandSchema, sourceIsCurrent } from './sources';

const source = { name: 'Hướng dẫn sản phẩm', kind: 'text', text: 'Thông tin do doanh nghiệp cung cấp.', url: null, authority: 'business', productIds: [], topics: ['Tư vấn'], freshnessHours: 24, active: true };
describe('knowledge source registry', () => {
  it('accepts scoped plaintext without fetching it', () => {
    expect(sourceDocumentSchema.parse(source)).toEqual(source);
  });
  it.each(['http://example.com/a', 'https://user:pass@example.com/a', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://localhost/a', 'https://service.local/a', 'https://metadata.google.internal/a'])('rejects unsafe registry URL %s', url => {
    expect(sourceDocumentSchema.safeParse({ ...source, kind: 'html', text: null, url }).success).toBe(false);
  });
  it('accepts a public HTTPS hostname as a candidate requiring later DNS validation', () => {
    expect(sourceDocumentSchema.parse({ ...source, kind: 'html', text: null, url: 'https://example.com/manual' }).url).toBe('https://example.com/manual');
  });
  it('canonicalizes valid scheme, host and trailing dot before the SQL boundary', () => {
    expect(sourceDocumentSchema.parse({ ...source, kind: 'html', text: null, url: 'HTTPS://EXAMPLE.COM.:443/manual' }).url).toBe('https://example.com/manual');
  });
  it.each([{ text: '' }, { text: 'x'.repeat(20001) }, { freshnessHours: 0 }, { freshnessHours: 721 }, { authority: 'system' }, { organizationId: 'injected' }, { kind: 'html', url: 'https://example.com', text: 'ambiguous' }])('rejects invalid source %j', override => {
    expect(sourceDocumentSchema.safeParse({ ...source, ...override }).success).toBe(false);
  });
  it('requires explicit revision and valid request identity', () => {
    expect(sourceCommandSchema.safeParse({ id: 'bad', requestId: 'bad', expectedVersion: -1, document: source }).success).toBe(false);
  });
  it('invalidates disabled, revised, expired and future-dated ingestion', () => {
    const now = Date.parse('2026-09-12T00:00:00Z');
    const record = { version: 2, document: sourceDocumentSchema.parse(source) };
    expect(sourceIsCurrent(record, { version: 2, fetchedAt: new Date(now - 1000).toISOString() }, now)).toBe(true);
    for (const ingestion of [{ version: 1, fetchedAt: new Date(now).toISOString() }, { version: 2, fetchedAt: new Date(now - 86400000).toISOString() }, { version: 2, fetchedAt: new Date(now + 1).toISOString() }]) expect(sourceIsCurrent(record, ingestion, now)).toBe(false);
    expect(sourceIsCurrent({ ...record, document: { ...record.document, active: false } }, { version: 2, fetchedAt: new Date(now).toISOString() }, now)).toBe(false);
  });
});
