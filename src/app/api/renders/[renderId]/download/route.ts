// SPDX-License-Identifier: Apache-2.0

import { createMediaRoute, type MediaDependencies } from "../video/route";

type Context = { params: Promise<{ renderId: string }> };

export function createDownloadRoute(dependencies: MediaDependencies) {
  return createMediaRoute(dependencies, true);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createDownloadRoute(getComposition()).GET(request, context);
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createDownloadRoute(getComposition()).HEAD(request, context);
}
