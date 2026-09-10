// SPDX-License-Identifier: Apache-2.0

import "server-only";

import { readServerEnv } from "@/lib/env/server";
import { createDashboardHandler, getDashboardData, type DashboardClient } from "@/lib/stats/aggregations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  const handler = createDashboardHandler(async () => {
    const { runtime } = readServerEnv();
    return getDashboardData(
      createSupabaseServerClient() as unknown as DashboardClient,
      { organizationId: runtime.organizationId },
    );
  });
  return handler.GET();
}
