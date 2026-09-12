// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createShippingSettingsService, type ConfirmationPort } from "@/lib/orders/confirmation";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const saveSchema = z.object({
  requestId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  expectedRevision: z.number().int().min(0),
  flatFeeVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

function port(): ConfirmationPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiPermission(request, "update_shipping", async (actor) => {
    try {
      return Response.json(await createShippingSettingsService(port(), actor).read());
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_FORBIDDEN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
      throw error;
    }
  });
}

export async function POST(request: Request) {
  return withApiPermission(request, "update_shipping", async (actor) => {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    let body: unknown;
    try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 }); }
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    try {
      return Response.json(await createShippingSettingsService(port(), actor).save(parsed.data));
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_FORBIDDEN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
      if (error instanceof Error && error.message === "ORDER_CONFLICT") return Response.json({ error: { code: "VERSION_CONFLICT" } }, { status: 409 });
      if (error instanceof Error && error.message === "ORDER_INVALID") return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
      throw error;
    }
  }, { mutation: true });
}
