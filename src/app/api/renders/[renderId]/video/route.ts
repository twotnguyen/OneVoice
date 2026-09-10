// SPDX-License-Identifier: Apache-2.0

import { createVideoRoute } from "@/lib/video/media-response";

type Context = { params: Promise<{ renderId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createVideoRoute(getComposition()).GET(request, context);
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createVideoRoute(getComposition()).HEAD(request, context);
}
