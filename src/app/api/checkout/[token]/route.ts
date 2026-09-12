// SPDX-License-Identifier: Apache-2.0
import { confirmationHeaders, confirmationLimiter, createConfirmationService, customerMutationAllowed, type ConfirmationPort } from "@/lib/orders/confirmation";
import { readAuthConfig } from "@/lib/auth/config";
import { createSupabaseDataClient } from "@/lib/supabase/server";

function port(): ConfirmationPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export function createCheckoutTokenRoute(service: ReturnType<typeof createConfirmationService>, origin: string) {
  return {
    async GET(_request: Request, token: string) {
      const result = await service.read(token);
      if (!result.ok) return Response.json({ error: { code: result.code } }, { status: result.code === "RATE_LIMITED" ? 429 : 404, headers: confirmationHeaders() });
      return Response.json({ quote: result.quote }, { headers: confirmationHeaders() });
    },
    async POST(request: Request, token: string) {
      if (!customerMutationAllowed(request, origin)) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403, headers: confirmationHeaders() });
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: confirmationHeaders() });
      let body: unknown;
      try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: confirmationHeaders() }); }
      if (!body || typeof body !== "object" || !("action" in body)) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: confirmationHeaders() });
      const action = body.action;
      if (action === "save" && "document" in body && "requestId" in body && typeof body.requestId === "string") {
        const result = await service.save(token, body.document, body.requestId);
        if (!result.ok) return Response.json({ error: { code: result.code } }, { status: result.code === "ORDER_INVALID" ? 400 : 404, headers: confirmationHeaders() });
        return Response.json({ quote: result.quote }, { headers: confirmationHeaders() });
      }
      if (action === "confirm") {
        const result = await service.confirm(token, body);
        if (!result.ok) return Response.json({ error: { code: result.code } }, { status: 404, headers: confirmationHeaders() });
        return Response.json(result, { headers: confirmationHeaders() });
      }
      return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: confirmationHeaders() });
    },
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = readAuthConfig().origin;
  return createCheckoutTokenRoute(createConfirmationService(port(), { origin, limiter: confirmationLimiter }), origin).GET(request, token);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = readAuthConfig().origin;
  return createCheckoutTokenRoute(createConfirmationService(port(), { origin, limiter: confirmationLimiter }), origin).POST(request, token);
}
