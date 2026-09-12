// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { withApiPermission } from '@/lib/auth/guards';
import { createSupabaseDataClient } from '@/lib/supabase/server';
import { SourcesRepository, SourceError } from '@/lib/knowledge/sources-repository';
import { sourceCommandSchema, sourceQuerySchema } from '@/lib/knowledge/sources';

export async function GET(request: Request) {
  return withApiPermission(request, 'read_operations', async actor => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const repository = new SourcesRepository(createSupabaseDataClient());
    if ('id' in params) {
      const parsed = z.strictObject({ id: z.string().uuid() }).safeParse(params);
      if (!parsed.success) return Response.json({ error: 'INVALID_QUERY' }, { status: 400 });
      const source = await repository.get(actor.organizationId, parsed.data.id);
      return source ? Response.json(source) : Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    const parsed = sourceQuerySchema.safeParse(params);
    if (!parsed.success) return Response.json({ error: 'INVALID_QUERY' }, { status: 400 });
    return Response.json(await repository.list(actor.organizationId, parsed.data.page, parsed.data.pageSize));
  });
}
export async function POST(request: Request) {
  return withApiPermission(request, 'manage_policies', async actor => {
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return Response.json({ error: 'INVALID_SOURCE' }, { status: 400 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'INVALID_SOURCE' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 131072) { await reader.cancel(); return Response.json({ error: 'INVALID_SOURCE' }, { status: 400 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return Response.json({ error: 'INVALID_SOURCE' }, { status: 400 }); }
    const parsed = sourceCommandSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'INVALID_SOURCE', message: parsed.error.issues.map(issue => issue.message).join('; ') }, { status: 400 });
    try {
      return Response.json(await new SourcesRepository(createSupabaseDataClient()).save(actor.organizationId, actor.userId, parsed.data));
    } catch (error) {
      if (error instanceof SourceError && error.code !== 'UNAVAILABLE') return Response.json({ error: error.code }, { status: error.code === 'CONFLICT' ? 409 : error.code === 'FORBIDDEN' ? 403 : 400 });
      throw error;
    }
  }, { mutation: true });
}
