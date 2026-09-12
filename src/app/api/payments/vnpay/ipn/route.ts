// SPDX-License-Identifier: Apache-2.0
import { createVnpayIpnRoute, type VnpayIpnPort } from "@/lib/payments/vnpay/notification";
import { createSupabaseDataClient } from "@/lib/supabase/server";

function port(): VnpayIpnPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return createVnpayIpnRoute({ port: port() }).GET(request);
}
