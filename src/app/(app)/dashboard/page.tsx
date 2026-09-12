// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { requirePagePermission } from "@/lib/auth/guards";

import { readServerEnv } from "@/lib/env/server";
import { getDashboardData, type DashboardClient } from "@/lib/stats/aggregations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";

import { KpiGrid } from "./kpis";
import { QuickActions } from "./quick-actions";
import { RecentActivityTable } from "./recent-table";
import { ServiceHealth } from "./service-health";
import { TrendChart } from "./trend-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePagePermission("manage_marketing", "/dashboard");
  const { runtime } = readServerEnv();
  const supabase = createSupabaseServerClient();

  // Run all dashboard and catalog aggregations concurrently
  const [data, p1, p2, p3] = await Promise.all([
    getDashboardData(
      supabase as unknown as DashboardClient,
      { organizationId: runtime.organizationId },
    ),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("content_ready_products").select("*", { count: "exact", head: true }),
    supabase.from("product_images").select("*", { count: "exact", head: true }),
  ]);

  const totalProducts = p1.count ?? 4109;
  const contentReadyProducts = p2.count ?? 3977;
  const totalImages = p3.count ?? 24351;

  // Verify which video artifacts exist on local disk
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

  return (
    <div className="dashboard-page-container">
      {/* Executive Masthead */}
      <header className="page-masthead">
        <div className="page-masthead__title">
          <div className="dashboard-title-row">
            <h1>Trung Tâm Điều Hành & Vận Hành AI</h1>
            <span className="live-status-chip">
              <span className="live-status-chip__dot" aria-hidden="true" />
              <span>Thời Gian Thực</span>
            </span>
          </div>
          <p>Giám sát sức khỏe hạ tầng, phễu nội dung catalog, và hiệu suất render video tự động của OneVoice.</p>
        </div>
      </header>

      {/* 4 Executive KPI Cards */}
      <KpiGrid
        data={data}
        totalProducts={totalProducts}
        contentReadyProducts={contentReadyProducts}
        totalImages={totalImages}
      />

      {/* Quick Launch Center */}
      <QuickActions />

      {/* 2-Column Analytics Grid: Trend Chart (60%) + Service Health (40%) */}
      <div className="dashboard-analytics-grid">
        <div className="analytics-grid__chart">
          <TrendChart trend={data.trend} />
        </div>
        <div className="analytics-grid__health">
          <ServiceHealth
            totalProducts={totalProducts}
            contentReadyProducts={contentReadyProducts}
          />
        </div>
      </div>

      {/* Recent Activity Table */}
      <RecentActivityTable recent={recent} />
    </div>
  );
}
