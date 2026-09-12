// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from '@/lib/auth/guards';
import { createSupabaseDataClient } from '@/lib/supabase/server';
import { SourcesRepository } from '@/lib/knowledge/sources-repository';
import { SourcesClient } from './sources-client';
export const dynamic = 'force-dynamic';
export default async function SourcesPage() {
  const actor = await requirePagePermission('read_operations', '/knowledge/sources');
  const initial = await new SourcesRepository(createSupabaseDataClient()).list(actor.organizationId, 1, 20);
  return <SourcesClient initial={initial} canManage={actor.role === 'manager'} />;
}
