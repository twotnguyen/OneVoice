// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

import { readServerEnv } from "@/lib/env/server";
import { getDashboardData, type DashboardClient } from "@/lib/stats/aggregations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";

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

  // DB says hasVideo from insert-time manifest; drop links whose artifact is
  // gone from disk (GC'd live run) so the table never links to a 404.
  const mediaRoot = path.isAbsolute(runtime.mediaRoot)
    ? runtime.mediaRoot
    : path.resolve(process.cwd(), runtime.mediaRoot);
  const library = new LocalVideoLibrary(mediaRoot);
  const recent = await Promise.all(
    data.recent.map(async (row) => ({
      ...row,
      hasVideo: row.hasVideo && (await library.videoExists(row.renderId).catch(() => false)),
    })),
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
      <RecentActivityTable recent={recent} />
    </section>
  );
}
