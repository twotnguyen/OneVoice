// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { sourceCommandSchema, sourceDocumentSchema, type SourceCommand, type SourcePage, type SourceRecord } from './sources';

export class SourceError extends Error {
  constructor(public code: 'CONFLICT' | 'FORBIDDEN' | 'INVALID' | 'UNAVAILABLE') { super(code); }
}
function mapSource(row: Database['public']['Tables']['knowledge_sources']['Row']): SourceRecord {
  return { id: row.id, version: row.version, document: sourceDocumentSchema.parse(row.document), updatedAt: row.updated_at };
}
/** Trusted scoped repository. Callers authorize reads; SQL rechecks manager mutations. */
export class SourcesRepository {
  constructor(private client: SupabaseClient<Database>) {}
  async list(organizationId: string, page: number, pageSize: number): Promise<SourcePage> {
    const offset = (page - 1) * pageSize;
    const { data, error, count } = await this.client.from('knowledge_sources').select('*', { count: 'exact' }).eq('organization_id', organizationId)
      .order('updated_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
    if (error) throw new SourceError('UNAVAILABLE');
    return { items: (data ?? []).map(mapSource), total: count ?? 0, page, pageSize };
  }
  async get(organizationId: string, id: string): Promise<(SourceRecord & { productNames: Record<string, string> }) | null> {
    const { data, error } = await this.client.from('knowledge_sources').select('*').eq('organization_id', organizationId).eq('id', z.string().uuid().parse(id)).maybeSingle();
    if (error) throw new SourceError('UNAVAILABLE');
    if (!data) return null;
    const source = mapSource(data);
    const products = source.document.productIds.length ? await this.client.from('products').select('id,name').eq('organization_id', organizationId).in('id', source.document.productIds) : { data: [], error: null };
    if (products.error) throw new SourceError('UNAVAILABLE');
    return { ...source, productNames: Object.fromEntries((products.data ?? []).map(product => [product.id, product.name])) };
  }
  async save(organizationId: string, actorId: string, input: SourceCommand): Promise<{ id: string; version: number }> {
    const command = sourceCommandSchema.parse(input);
    const { data, error } = await this.client.rpc('save_knowledge_source', { p_organization_id: organizationId, p_actor_id: actorId, p_id: command.id, p_request_id: command.requestId, p_expected_version: command.expectedVersion, p_document: command.document as Json });
    if (error) throw new SourceError(error.code === '42501' ? 'FORBIDDEN' : ['40001', '23505'].includes(error.code) ? 'CONFLICT' : ['22023', '22P02'].includes(error.code) ? 'INVALID' : 'UNAVAILABLE');
    return z.object({ id: z.string().uuid(), version: z.number().int().positive() }).parse(data);
  }
}
