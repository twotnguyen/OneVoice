// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { KnowledgeError, KnowledgeRepository } from "@/lib/knowledge/repository";
import { knowledgeCommandSchema, knowledgeQuerySchema } from "@/lib/knowledge/management";
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status });
export async function GET(request: Request) {
  return withApiPermission(request, "manage_policies", async actor => {
    const params = new URL(request.url).searchParams;
    if (params.has("scope")) {
      const ids = z.array(z.string().uuid()).min(1).max(100).safeParse(params.get("scope")?.split(","));
      if (!ids.success) return failure(400, "INVALID");
      const { data, error } = await createSupabaseDataClient().from("products").select("id,name").eq("organization_id", actor.organizationId).in("id", ids.data);
      if (error) return failure(503, "UNAVAILABLE");
      return Response.json(data ?? []);
    }
    if (params.has("history")) {
      const id = z.string().uuid().safeParse(params.get("history"));
      if (!id.success) return failure(400, "INVALID");
      return Response.json(await new KnowledgeRepository(createSupabaseDataClient()).history(actor.organizationId, id.data));
    }
    const query = knowledgeQuerySchema.safeParse(Object.fromEntries(params));
    if (!query.success) return failure(400, "INVALID");
    return Response.json(await new KnowledgeRepository(createSupabaseDataClient()).list(actor.organizationId, query.data));
  });
}
export async function POST(request: Request) {
  return withApiPermission(request, "manage_policies", async actor => {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(400, "INVALID");
    const reader = request.body?.getReader(); if (!reader) return failure(400, "INVALID");
    let size = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); return failure(400, "INVALID"); } chunks.push(value); } } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return failure(400, "INVALID"); }
    const command = knowledgeCommandSchema.safeParse(body);
    if (!command.success) return failure(400, "INVALID");
    try { return Response.json(await new KnowledgeRepository(createSupabaseDataClient()).save(actor, command.data)); }
    catch (error) {
      if (error instanceof KnowledgeError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code);
      throw error;
    }
  }, { mutation: true });
}
