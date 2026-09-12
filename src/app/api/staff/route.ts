// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { staffCommandSchema } from "@/lib/auth/staff-admin";
import { StaffAdminError, StaffAdminRepository } from "@/lib/auth/staff-admin-repository";
export async function GET(request: Request) {
  return withApiPermission(request, "manage_staff", async actor => {
    const query = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return Response.json({ error: "INVALID" }, { status: 400 });
    return Response.json(await new StaffAdminRepository(createSupabaseDataClient(), "").list(actor.organizationId, actor.userId, query.data.page));
  });
}
export async function POST(request: Request) {
  return withApiPermission(request, "manage_staff", async actor => {
    const invalid = () => Response.json({ error: "INVALID" }, { status: 400 });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return invalid();
    const reader = request.body?.getReader(); if (!reader) return invalid();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); return invalid(); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return invalid(); }
    const parsed = staffCommandSchema.safeParse(body); if (!parsed.success) return invalid();
    try { return Response.json(await new StaffAdminRepository(createSupabaseDataClient(), process.env.SUPABASE_SECRET_KEY ?? "").save(actor.organizationId, actor.userId, parsed.data)); }
    catch (error) {
      if (error instanceof StaffAdminError) return Response.json({ error: error.code }, { status: error.code === "FORBIDDEN" ? 403 : ["CONFLICT", "LAST_MANAGER"].includes(error.code) ? 409 : error.code === "INVALID" ? 400 : 503 });
      return Response.json({ error: "PROVISION_UNCONFIRMED" }, { status: 503 });
    }
  }, { mutation: true });
}
