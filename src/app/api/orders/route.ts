// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { acknowledgeCommandSchema, asOperationsPort, createOrderOperationsRepository, orderOperationsQuerySchema, OrderOperationsError } from "@/lib/orders/operations";

const failure = (status: number, code: string) => Response.json({ error: { code } }, { status });
const port = () => asOperationsPort(createSupabaseDataClient());

export async function GET(request: Request) {
  return withApiPermission(request, "read_operations", async (actor) => {
    const params = new URL(request.url).searchParams;
    if (params.get("exceptions") === "true") {
      if (actor.role !== "manager") return failure(403, "FORBIDDEN");
      try { return Response.json(await createOrderOperationsRepository(port(), actor).exceptions()); }
      catch (error) { if (error instanceof OrderOperationsError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code); throw error; }
    }
    const query = orderOperationsQuerySchema.safeParse(Object.fromEntries(params));
    if (!query.success) return failure(400, "INVALID");
    try { return Response.json(await createOrderOperationsRepository(port(), actor).list(query.data)); }
    catch (error) { if (error instanceof OrderOperationsError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code); throw error; }
  });
}

export async function POST(request: Request) {
  return withApiPermission(request, "update_order", async (actor) => {
    if (actor.role !== "manager") return failure(403, "FORBIDDEN");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(400, "INVALID");
    const reader = request.body?.getReader();
    if (!reader) return failure(400, "INVALID");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8000) { await reader.cancel(); return failure(400, "INVALID"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return failure(400, "INVALID"); }
    const input = acknowledgeCommandSchema.safeParse(body);
    if (!input.success) return failure(400, "INVALID");
    try { return Response.json(await createOrderOperationsRepository(port(), actor).acknowledge(input.data)); }
    catch (error) { if (error instanceof OrderOperationsError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code); throw error; }
  }, { mutation: true });
}
