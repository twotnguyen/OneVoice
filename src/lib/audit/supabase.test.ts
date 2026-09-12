import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createSupabaseAuditRepository } from './supabase';
it('scopes and orders adapter pages using a strict microsecond cursor', async () => {
    const calls: unknown[][] = [];
    const query = { select(...a: unknown[]) { calls.push(['select', ...a]); return this; }, eq(...a: unknown[]) { calls.push(['eq', ...a]); return this; }, order(...a: unknown[]) { calls.push(['order', ...a]); return this; }, limit(...a: unknown[]) { calls.push(['limit', ...a]); return this; }, or(...a: unknown[]) { calls.push(['or', ...a]); return this; }, then(resolve: (v: unknown) => unknown) { return Promise.resolve(resolve({ data: [], error: null })); } };
    const client = { from(name: string) { calls.push(['from', name]); return query; } } as unknown as SupabaseClient<Database>;
    const repo = createSupabaseAuditRepository(client);
    const organization_id = 'a0000000-0000-0000-0000-000000000001';
    await expect(repo.list({ organization_id, limit: 100, action: 'order.created', cursor: { created_at: '2026-09-12T12:00:00.123456+00:00', id: organization_id } })).resolves.toEqual({ events: [], next_cursor: null });
    expect(calls).toContainEqual(['eq', 'organization_id', organization_id]);
    expect(calls).toContainEqual(['eq', 'action', 'order.created']);
    expect(calls).toContainEqual(['limit', 101]);
    expect(calls.filter(c => c[0] === 'order')).toEqual([['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }]]);
    expect(calls).toContainEqual(['or', `created_at.lt.2026-09-12T12:00:00.123456+00:00,and(created_at.eq.2026-09-12T12:00:00.123456+00:00,id.lt.${organization_id})`]);
    await expect(repo.list({ organization_id, cursor: { created_at: 'x),organization_id.neq.x', id: organization_id } })).rejects.toThrow();
});
