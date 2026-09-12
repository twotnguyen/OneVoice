import { describe, expect, it } from 'vitest';
import { createAuditRepository, type AuditEvent, type AuditPort, type NewAuditEvent } from './repository';
const input: NewAuditEvent = { organization_id: 'a0000000-0000-0000-0000-000000000001', actor_kind: 'system', actor_id: null, action: 'order.created', entity_type: 'order', entity_id: 'c0000000-0000-4000-8000-000000000001', reason: 'workflow.started', correlation_id: 'd0000000-0000-4000-8000-000000000001', idempotency_key: 'e0000000-0000-4000-8000-000000000001' };
function fixture() {
    const rows: AuditEvent[] = [];
    const port: AuditPort = { async insert(value) { if (rows.some(r => r.idempotency_key === value.idempotency_key))
            return { data: null, error: { code: '23505' } }; const row = { ...value, id: 'f0000000-0000-4000-8000-000000000001', created_at: '2026-09-12T00:00:00.000000+00:00' }; rows.push(row); return { data: row, error: null }; }, async findByKey(key) { return { data: rows.find(r => r.idempotency_key === key) ?? null, error: null }; }, async list(query) { return { data: rows.filter(r => r.organization_id === query.organization_id).slice(0, query.limit), error: null }; } };
    return { repo: createAuditRepository(port), rows };
}
describe('audit repository', () => {
    it('retries identical events without overwriting history', async () => { const { repo, rows } = fixture(); const first = await repo.append(input); expect(await repo.append(input)).toEqual(first); expect(rows).toHaveLength(1); });
    it('rejects conflicting idempotency keys', async () => { const { repo } = fixture(); await repo.append(input); await expect(repo.append({ ...input, reason: 'different.reason' })).rejects.toThrow('idempotency conflict'); });
    it.each([{ ...input, reason: 'private chat text' }, { ...input, actor_kind: 'staff' }, { ...input, payload: 'secret' }, { ...input, correlation_id: 'raw-token' }])('rejects unsafe input before storage', async (value) => { const { repo, rows } = fixture(); await expect(repo.append(value as NewAuditEvent)).rejects.toThrow(); expect(rows).toHaveLength(0); });
    it('returns bounded pagination with exact timestamp cursor', async () => { const { repo, rows } = fixture(); await repo.append(input); rows.push({ ...rows[0], id: 'f0000000-0000-4000-8000-000000000002' }); const page = await repo.list({ organization_id: input.organization_id, limit: 1 }); expect(page.events).toHaveLength(1); expect(page.next_cursor).toEqual({ created_at: rows[0].created_at, id: rows[0].id }); });
    it.each([0, 101, 1.5])('rejects invalid page size %s', async (limit) => { await expect(fixture().repo.list({ organization_id: input.organization_id, limit })).rejects.toThrow(); });
    it('does not suppress storage errors', async () => { const repo = createAuditRepository({ insert: async () => ({ data: null, error: { code: '08006' } }), findByKey: async () => ({ data: null, error: null }), list: async () => ({ data: [], error: null }) }); await expect(repo.append(input)).rejects.toThrow('audit storage failed'); });
});
