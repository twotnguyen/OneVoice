// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupabaseAuditRepository } from "@/lib/audit/supabase";

const query = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(30), action: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/).optional(), cursor: z.string().max(300).optional() });
export async function GET(request: Request) {
  return withApiPermission(request, "read_audit", async actor => {
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
    let cursor;
    try { cursor = parsed.data.cursor ? JSON.parse(parsed.data.cursor) : undefined; } catch { return Response.json({ error: "INVALID_QUERY" }, { status: 400 }); }
    try {
      return Response.json(await createSupabaseAuditRepository(createSupabaseDataClient()).list({ organization_id: actor.organizationId, limit: parsed.data.limit, action: parsed.data.action, cursor }));
    } catch (error) {
      if (error instanceof z.ZodError) return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
      throw error;
    }
  });
}
