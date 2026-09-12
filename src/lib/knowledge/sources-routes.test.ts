import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ actor: null as null | { role: string; userId: string; organizationId: string }, client: vi.fn(), list: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/auth/routes', () => ({ createAuthContext: async () => ({ session: async () => state.actor, finish: (response: Response) => response }) }));
vi.mock('@/lib/auth/config', () => ({ readAuthConfig: () => ({ origin: 'https://app.test' }) }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseDataClient: state.client }));
vi.mock('./sources-repository', async actual => {
  const mod = await actual<typeof import('./sources-repository')>();
  return { ...mod, SourcesRepository: class { list = state.list; get = state.get; save = state.save; } };
});
import { GET, POST } from '@/app/api/knowledge/sources/route';
const id = 'e0000000-0000-4000-8000-000000000049';
const command = { id, requestId: id, expectedVersion: 0, document: { name: 'Manual', kind: 'text', text: 'Some facts', url: null, authority: 'business', productIds: [], topics: [], freshnessHours: 24, active: true } };
const request = (body: unknown = command, origin = 'https://app.test') => new Request('https://app.test/api/knowledge/sources', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.actor = { role: 'manager', userId: 'actor', organizationId: 'org' }; state.list.mockResolvedValue({ items: [] }); state.save.mockResolvedValue({ id, version: 1 }); });
it('rejects anonymous reads and staff writes before storage', async () => {
  state.actor = null; expect((await GET(new Request('https://app.test/api/knowledge/sources'))).status).toBe(401);
  state.actor = { role: 'staff', userId: 'staff', organizationId: 'org' }; expect((await POST(request())).status).toBe(403);
  expect(state.client).not.toHaveBeenCalled();
  expect((await GET(new Request('https://app.test/api/knowledge/sources'))).status).toBe(200);
});
it('requires Origin and rejects oversized or unsafe sources', async () => {
  expect((await POST(request(command, 'https://evil.test'))).status).toBe(403);
  expect((await POST(request({ x: 'x'.repeat(131073) }))).status).toBe(400);
  expect((await POST(request({ ...command, document: { ...command.document, kind: 'html', text: null, url: 'https://localhost' } }))).status).toBe(400);
  expect(state.save).not.toHaveBeenCalled();
});
it('uses the verified actor scope and bounds list queries', async () => {
  expect((await POST(request())).status).toBe(200);
  expect(state.save).toHaveBeenCalledWith('org', 'actor', command);
  expect((await GET(new Request('https://app.test/api/knowledge/sources?pageSize=500'))).status).toBe(400);
});
