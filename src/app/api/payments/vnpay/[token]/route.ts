// SPDX-License-Identifier: Apache-2.0
import { createVnpayCheckoutRoute, type VnpayCheckoutPort } from "@/lib/payments/vnpay/checkout";
import { readAuthConfig } from "@/lib/auth/config";
import { createSupabaseDataClient } from "@/lib/supabase/server";

function port(): VnpayCheckoutPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return createVnpayCheckoutRoute({ port: port(), origin: readAuthConfig().origin }).POST(request, token);
}
