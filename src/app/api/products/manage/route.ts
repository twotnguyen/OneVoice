// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { managementCommandSchema, managementListSchema } from "@/lib/catalog/management";
import { CatalogManagementRepository, ManagementError } from "@/lib/catalog/management-repository";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const error = (status: number, code: string) => Response.json({ error: { code } }, { status });
function failure(cause: unknown) {
  if (cause instanceof ManagementError) return error(({ CONFLICT: 409, FORBIDDEN: 403, INVALID: 400, UNAVAILABLE: 503 })[cause.code], cause.code);
  return error(503, "UNAVAILABLE");
}
export async function GET(request: Request): Promise<Response> {
  return withApiPermission(request, "manage_catalog", async (actor) => {
    const params = new URL(request.url).searchParams;
    try {
      if (params.has("id")) {
        const id = z.uuid().safeParse(params.get("id"));
        if (!id.success) return error(400, "INVALID");
        const product = await new CatalogManagementRepository(createSupabaseDataClient()).get(actor.organizationId, id.data);
        return product ? Response.json(product) : error(404, "NOT_FOUND");
      }
      const options = managementListSchema.safeParse(Object.fromEntries(params));
      if (!options.success) return error(400, "INVALID");
      return Response.json(await new CatalogManagementRepository(createSupabaseDataClient()).list(actor.organizationId, options.data));
    } catch (cause) { return failure(cause); }
  });
}
async function readCommand(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw Error("INVALID");
  const reader = request.body?.getReader();
  if (!reader) throw Error("INVALID");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) { await reader.cancel(); throw Error("INVALID"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(request: Request): Promise<Response> {
  return withApiPermission(request, "manage_catalog", async (actor) => {
    let payload: unknown;
    try { payload = await readCommand(request); } catch { return error(400, "INVALID"); }
    const command = managementCommandSchema.safeParse(payload);
    if (!command.success) return error(400, "INVALID");
    try { return Response.json(await new CatalogManagementRepository(createSupabaseDataClient()).save(actor, command.data)); }
    catch (cause) { return failure(cause); }
  }, { mutation: true });
}
