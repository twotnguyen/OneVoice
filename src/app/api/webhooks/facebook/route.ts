// SPDX-License-Identifier: Apache-2.0
import { createFacebookBackend } from "@/lib/channels/facebook/backend";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 try { return await createFacebookBackend().GET(request); }
 catch { return new Response("Webhook unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export async function POST(request: Request) {
 try { return await createFacebookBackend().POST(request); }
 catch { return new Response("Webhook unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
