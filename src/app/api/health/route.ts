// SPDX-License-Identifier: Apache-2.0
// Public liveness only. Detailed dependency diagnostics require /api/ready auth.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok", service: "onevoice" }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
