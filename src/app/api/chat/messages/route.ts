// SPDX-License-Identifier: Apache-2.0
import { createSupabaseWebsiteMessagesPort, createWebsiteMessagesRoute } from "@/lib/channels/web/messages";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json" };

function handlers(request: Request) {
  const client = createSupabaseDataClient();
  return createWebsiteMessagesRoute(createSupabaseWebsiteMessagesPort({
    rpc: (name, args) => client.rpc(name as never, args as never),
    from: (table) => client.from(table as never) as never,
  }), { origin: new URL(request.url).origin });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return await handlers(request).GET(request); }
  catch { return new Response(JSON.stringify({ ok: false }), { status: 503, headers: noStore }); }
}

export async function POST(request: Request) {
  try { return await handlers(request).POST(request); }
  catch { return new Response(JSON.stringify({ ok: false }), { status: 503, headers: noStore }); }
}
