// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const code = z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/);
const entityType = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const eventSchema = z.strictObject({
    organization_id: uuid, actor_kind: z.enum(['staff', 'system']), actor_id: uuid.nullable(),
    action: code, entity_type: entityType, entity_id: uuid, reason: code, correlation_id: uuid, idempotency_key: uuid,
}).refine(e => e.actor_kind === 'staff' ? e.actor_id !== null : e.actor_id === null);
/** Codes must be application-defined constants, never derived from user text. IDs are opaque UUIDs. */
export type NewAuditEvent = z.infer<typeof eventSchema>;
export type AuditEvent = NewAuditEvent & {
    id: string;
    created_at: string;
};
// Retain PostgreSQL microseconds: converting cursors to Date loses ordering precision.
const cursorSchema = z.strictObject({ created_at: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/), id: uuid });
const querySchema = z.strictObject({ organization_id: uuid, limit: z.number().int().min(1).max(100).default(50), cursor: cursorSchema.optional(), action: code.optional(), entity_type: entityType.optional(), entity_id: uuid.optional(), actor_id: uuid.optional() });
export type AuditQuery = z.input<typeof querySchema>;
export type AuditCursor = z.infer<typeof cursorSchema>;
type Result<T> = {
    data: T | null;
    error: {
        code?: string;
    } | null;
};
/** Trusted server port only. Do not expose without verified manager authorization. */
export interface AuditPort {
    insert(event: NewAuditEvent): Promise<Result<AuditEvent>>;
    findByKey(key: string): Promise<Result<AuditEvent>>;
    list(query: Omit<z.output<typeof querySchema>, 'limit'> & {
        limit: number;
    }): Promise<Result<AuditEvent[]>>;
}
export function createAuditRepository(port: AuditPort) {
    return {
        /** Standalone append. Mutations of orders/permissions MUST insert in their own DB transaction/RPC. */
        async append(input: NewAuditEvent): Promise<AuditEvent> {
            const event = eventSchema.parse(input);
            const result = await port.insert(event);
            if (!result.error && result.data)
                return result.data;
            if (result.error?.code === '23505') {
                const existing = await port.findByKey(event.idempotency_key);
                if (existing.error)
                    throw new Error('audit storage failed');
                const row = existing.data;
                if (row && (Object.keys(event) as (keyof NewAuditEvent)[]).every(k => row[k] === event[k]))
                    return row;
                throw new Error('audit idempotency conflict');
            }
            throw new Error('audit storage failed');
        },
        async list(input: AuditQuery): Promise<{
            events: AuditEvent[];
            next_cursor: AuditCursor | null;
        }> {
            const query = querySchema.parse(input);
            const result = await port.list({ ...query, limit: query.limit + 1 });
            if (result.error || !result.data)
                throw new Error('audit storage failed');
            const events = result.data.slice(0, query.limit);
            const last = events.at(-1);
            return { events, next_cursor: result.data.length > query.limit && last ? { created_at: last.created_at, id: last.id } : null };
        },
    };
}
