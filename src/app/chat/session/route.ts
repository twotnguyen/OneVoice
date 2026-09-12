// SPDX-License-Identifier: Apache-2.0
import { readAuthConfig } from "@/lib/auth/config";
import { createWebsiteSession } from "@/lib/channels/web/session";
import { createSupabaseDataClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const config = readAuthConfig();
    const client = createSupabaseDataClient();
    return await createWebsiteSession({
      rpc: (name, args) => client.rpc(name as never, args as never),
    }, { organizationId: config.organizationId, origin: new URL(request.url).origin })(request);
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: noStore });
  }
}
