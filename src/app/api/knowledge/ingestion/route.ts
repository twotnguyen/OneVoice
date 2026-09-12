// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createIngestionManager, ingestionRequestSchema } from "@/lib/knowledge/ingestion-repository";
const failure = (status: number, error: string) => Response.json({ error }, { status });
export async function GET(request: Request) {
 return withApiPermission(request, "manage_policies", async actor => {
  const query = z.strictObject({ sourceId: z.string().uuid() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return failure(400, "INVALID");
  const status = await createIngestionManager(createSupabaseDataClient(), actor).status(query.data.sourceId);
  return status ? Response.json(status) : failure(404, "NOT_FOUND");
 });
}
export async function POST(request: Request) {
 return withApiPermission(request, "manage_policies", async actor => {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(400, "INVALID");
  const reader = request.body?.getReader(); if (!reader) return failure(400, "INVALID");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); return failure(400, "INVALID"); } chunks.push(value); } } finally { reader.releaseLock(); }
  let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return failure(400, "INVALID"); }
  const input = ingestionRequestSchema.safeParse(body); if (!input.success) return failure(400, "INVALID");
  try { const runId = await createIngestionManager(createSupabaseDataClient(), actor).refresh(input.data.sourceId, input.data.version); return Response.json({ runId }, { status: 202 }); }
  catch (error) { if (error instanceof Error && ["CONFLICT", "FORBIDDEN"].includes(error.message)) return failure(error.message === "CONFLICT" ? 409 : 403, error.message); throw error; }
 }, { mutation: true });
}
