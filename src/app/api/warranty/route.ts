// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { postgresUuid } from "@/lib/jobs/types";
import { createWarrantyRepository, WarrantyError } from "@/lib/warranty/repository";
import { warrantyCommandSchema, warrantyQuerySchema } from "@/lib/warranty/management";
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status });
export async function GET(request: Request) {
 return withApiPermission(request, "update_warranty", async actor => {
  const params = new URL(request.url).searchParams;
  if (params.has("id")) { const id = postgresUuid.safeParse(params.get("id")); if (!id.success) return failure(400, "INVALID"); const record = await createWarrantyRepository(createSupabaseDataClient(), actor).get(id.data); return record ? Response.json(record) : failure(404, "NOT_FOUND"); }
  const orders = params.get("orders") === "true"; params.delete("orders");
  const query = warrantyQuerySchema.safeParse(Object.fromEntries(params)); if (!query.success) return failure(400, "INVALID");
  const repo = createWarrantyRepository(createSupabaseDataClient(), actor);
  return Response.json(orders ? await repo.eligible(query.data) : await repo.list(query.data));
 });
}
export async function POST(request: Request) {
 return withApiPermission(request, "update_warranty", async actor => {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(400, "INVALID");
  const reader = request.body?.getReader(); if (!reader) return failure(400, "INVALID");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 40000) { await reader.cancel(); return failure(400, "INVALID"); } chunks.push(value); } } finally { reader.releaseLock(); }
  let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return failure(400, "INVALID"); }
  const input = warrantyCommandSchema.safeParse(body); if (!input.success) return failure(400, "INVALID");
  try { return Response.json(await createWarrantyRepository(createSupabaseDataClient(), actor).save(input.data)); }
  catch (error) { if (error instanceof WarrantyError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code); throw error; }
 }, { mutation: true });
}
