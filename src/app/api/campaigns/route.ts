// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createCampaignRepository } from "@/lib/campaigns/repository";
import { campaignQuerySchema, manualCampaignSchema } from "@/lib/campaigns/management";
import { postgresUuid } from "@/lib/jobs/types";
const failure = (status: number, error: string) => Response.json({ error }, { status });
export async function GET(request: Request) {
 return withApiPermission(request, "read_operations", async actor => {
  const params = new URL(request.url).searchParams;
  if (params.has("id")) { const id = postgresUuid.safeParse(params.get("id")); if (!id.success || [...params.keys()].length !== 1) return failure(400, "INVALID"); const item = await createCampaignRepository(createSupabaseDataClient(), actor).get(id.data); return item ? Response.json(item) : failure(404, "NOT_FOUND"); }
  const query = campaignQuerySchema.safeParse(Object.fromEntries(params)); if (!query.success) return failure(400, "INVALID");
  return Response.json(await createCampaignRepository(createSupabaseDataClient(), actor).list(query.data.page));
 });
}
export async function POST(request: Request) {
 return withApiPermission(request, "manage_marketing", async actor => {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(400, "INVALID");
  const reader = request.body?.getReader(); if (!reader) return failure(400, "INVALID"); let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); return failure(400, "INVALID"); } chunks.push(value); } } finally { reader.releaseLock(); }
  let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return failure(400, "INVALID"); }
  const input = manualCampaignSchema.safeParse(body); if (!input.success) return failure(400, "INVALID");
  try { return Response.json(await createCampaignRepository(createSupabaseDataClient(), actor).priority(input.data), { status: 201 }); }
  catch (error) { if (error instanceof Error && ["SETTINGS_REQUIRED", "CONFLICT", "FORBIDDEN", "INVALID"].includes(error.message)) return failure(error.message === "CONFLICT" ? 409 : error.message === "FORBIDDEN" ? 403 : 400, error.message); throw error; }
 }, { mutation: true });
}
