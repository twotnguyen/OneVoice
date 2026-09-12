// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from "@/lib/auth/guards";
import { postgresUuid } from "@/lib/jobs/types";
import { asOperationsPort, createOrderOperationsRepository, OrderOperationsError, transitionCommandSchema } from "@/lib/orders/operations";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const failure = (status: number, code: string) => Response.json({ error: { code } }, { status });
const port = () => asOperationsPort(createSupabaseDataClient());
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return withApiPermission(request, "read_operations", async (actor) => {
    const id = postgresUuid.safeParse((await context.params).id);
    if (!id.success) return failure(400, "INVALID");
    try {
      const record = await createOrderOperationsRepository(port(), actor).get(id.data);
      return record ? Response.json(record) : failure(404, "NOT_FOUND");
    } catch (error) {
      if (error instanceof OrderOperationsError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code);
      throw error;
    }
  });
}

export async function POST(request: Request, context: Context) {
  return withApiPermission(request, "update_order", async (actor) => {
    const id = postgresUuid.safeParse((await context.params).id);
    if (!id.success) return failure(400, "INVALID");
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
    const input = transitionCommandSchema.safeParse(body);
    if (!input.success) return failure(400, "INVALID");
    try { return Response.json(await createOrderOperationsRepository(port(), actor).transition(id.data, input.data)); }
    catch (error) {
      if (error instanceof OrderOperationsError) return failure(({ INVALID: 400, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503 })[error.code], error.code);
      throw error;
    }
  }, { mutation: true });
}
