// SPDX-License-Identifier: Apache-2.0

import { readServerEnv } from "@/lib/env/server";
import { getDashboardData, type DashboardClient } from "@/lib/stats/aggregations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DashboardEmpty } from "./empty";
import { KpiGrid } from "./kpis";
import { RecentActivityTable } from "./recent-table";
import { TrendChart } from "./trend-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { runtime } = readServerEnv();
  const data = await getDashboardData(
    createSupabaseServerClient() as unknown as DashboardClient,
    { organizationId: runtime.organizationId },
  );

  if (data.totalRenders === 0) {
    return (
      <section aria-labelledby="dashboard-heading">
        <h1 id="dashboard-heading">Tổng quan</h1>
        <DashboardEmpty />
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-heading" className="dashboard">
      <h1 id="dashboard-heading">Tổng quan</h1>
      <KpiGrid data={data} />
      <TrendChart trend={data.trend} />
      <RecentActivityTable recent={data.recent} />
    </section>
  );
}
