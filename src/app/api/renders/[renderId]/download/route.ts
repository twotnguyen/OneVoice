// SPDX-License-Identifier: Apache-2.0

import { createDownloadRoute } from "@/lib/video/media-response";
import { withApiPermission } from "@/lib/auth/guards";

type Context = { params: Promise<{ renderId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return withApiPermission(request, "manage_marketing", async () => {
    const { getComposition } = await import("@/lib/render/composition-root");
    return createDownloadRoute(getComposition()).GET(request, context);
  });
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  return withApiPermission(request, "manage_marketing", async () => {
    const { getComposition } = await import("@/lib/render/composition-root");
    return createDownloadRoute(getComposition()).HEAD(request, context);
  });
}
