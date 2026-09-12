// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createAuditRepository, type AuditEvent, type AuditPort } from './repository';
import { z } from 'zod';
const actorKind = z.enum(['staff', 'system']);
function decode(row: Database['public']['Tables']['audit_events']['Row']): AuditEvent {
    return { ...row, actor_kind: actorKind.parse(row.actor_kind) };
}
/** Supply a server-owned service-role client only; caller enforces session and manager scope. */
export function createSupabaseAuditRepository(client: SupabaseClient<Database>) {
    const port: AuditPort = {
        async insert(event) {
            const { data, error } = await client.from('audit_events').insert(event).select('*').single();
            return { data: data ? decode(data) : null, error };
        },
        async findByKey(key) {
            const { data, error } = await client.from('audit_events').select('*').eq('idempotency_key', key).maybeSingle();
            return { data: data ? decode(data) : null, error };
        },
        async list(input) {
            let query = client.from('audit_events').select('*').eq('organization_id', input.organization_id)
                .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(input.limit);
            if (input.action)
                query = query.eq('action', input.action);
            if (input.entity_type)
                query = query.eq('entity_type', input.entity_type);
            if (input.entity_id)
                query = query.eq('entity_id', input.entity_id);
            if (input.actor_id)
                query = query.eq('actor_id', input.actor_id);
            // Repository validation restricts these values to a timestamp/UUID grammar.
            if (input.cursor)
                query = query.or(`created_at.lt.${input.cursor.created_at},and(created_at.eq.${input.cursor.created_at},id.lt.${input.cursor.id})`);
            const { data, error } = await query;
            return { data: data?.map(decode) ?? null, error };
        },
    };
    return createAuditRepository(port);
}
