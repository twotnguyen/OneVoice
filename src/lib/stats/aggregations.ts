// SPDX-License-Identifier: Apache-2.0
//
// Dashboard aggregation: one bounded select over render_events plus the
// content-ready count and a products id→name lookup, then pure reducers.
// No `import "server-only"` here — reducer tests import this module directly.

export type RenderEventRow = Readonly<{
  render_id: string;
  organization_id: string;
  product_id: string | null;
  status: "succeeded" | "failed";
  error_stage: string | null;
  error_code: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  stage_timings: Record<string, number> | null;
  total_duration_ms: number | null;
  video_bytes: number | string | null;
  video_duration_ms: number | null;
  // T9 ledger columns; optional because the dashboard select does not fetch them.
  scene_count?: number | null;
  tts_total_ms?: number | null;
  renderer_revision?: string | null;
  script_sha256?: string | null;
  created_at: string;
}>;

export type DashboardScope = Readonly<{
  organizationId: string;
}>;

export type AiTokenTotals = Readonly<{
  input: number;
  output: number;
  total: number;
}>;

export type CatalogCoverage = Readonly<{
  productsWithVideo: number;
  contentReadyTotal: number;
  ratio: number;
}>;

export type DayBucket = Readonly<{
  date: string;
  count: number;
}>;

export type ActivityRow = Readonly<{
  renderId: string;
  productId: string | null;
  productName: string;
  status: "succeeded" | "failed";
  createdAt: string;
  totalDurationMs: number | null;
  hasVideo: boolean;
}>;

export type DashboardData = Readonly<{
  totalRenders: number;
  successRate: number | null;
  avgRenderDurationMs: number | null;
  aiTokens: AiTokenTotals | null;
  coverage: CatalogCoverage | null;
  trend: readonly DayBucket[];
  recent: readonly ActivityRow[];
}>;

// Minimal structural client so this module does not depend on the generated
// Database type (ponytail: tighten to SupabaseClient<Database> once
// database.types.ts includes render_events).
export type DashboardQueryResult = Readonly<{
  data: RenderEventRow[] | null;
  error: { code: string; message: string } | null;
  count: number | null;
}>;

export type NameQueryResult = Readonly<{
  data: ReadonlyArray<Readonly<{ id: string; name: string }>> | null;
  error: { code: string; message: string } | null;
}>;

export type DashboardQuery = {
  eq(column: string, value: unknown): DashboardQuery;
  gte(column: string, value: string): DashboardQuery;
  in(column: string, values: readonly string[]): DashboardQuery;
  order(column: string, options?: { ascending?: boolean }): DashboardQuery;
  limit(count: number): DashboardQuery;
  abortSignal(signal: AbortSignal): Promise<unknown>;
};

export type DashboardTable = {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): DashboardQuery;
};

export type DashboardClient = {
  from(table: string): DashboardTable;
};

const DASHBOARD_TIMEOUT_MS = 3000;
const RENDER_WINDOW_DAYS = 30;
const TREND_DAYS = 14;
const RECENT_LIMIT = 20;
// Vietnam has never observed DST — fixed offset is safe.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function totalRenders(rows: readonly RenderEventRow[]): number {
  return rows.length;
}

export function successRate(rows: readonly RenderEventRow[]): number | null {
  if (rows.length === 0) return null;
  return rows.filter((row) => row.status === "succeeded").length / rows.length;
}

export function avgRenderDurationMs(rows: readonly RenderEventRow[]): number | null {
  const durations = rows.flatMap((row) =>
    row.status === "succeeded" && row.total_duration_ms != null ? [row.total_duration_ms] : [],
  );
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

export function aiTokenTotals(rows: readonly RenderEventRow[]): AiTokenTotals | null {
  const withUsage = rows.filter(
    (row) => row.tokens_input != null || row.tokens_output != null || row.tokens_total != null,
  );
  if (withUsage.length === 0) return null;
  return {
    input: withUsage.reduce((sum, row) => sum + (row.tokens_input ?? 0), 0),
    output: withUsage.reduce((sum, row) => sum + (row.tokens_output ?? 0), 0),
    total: withUsage.reduce((sum, row) => sum + (row.tokens_total ?? 0), 0),
  };
}

export function catalogCoverage(
  rows: readonly RenderEventRow[],
  contentReadyTotal: number,
): CatalogCoverage | null {
  if (contentReadyTotal === 0) return null;
  const productsWithVideo = new Set(
    rows.flatMap((row) =>
      row.status === "succeeded" && row.product_id != null ? [row.product_id] : [],
    ),
  ).size;
  return { productsWithVideo, contentReadyTotal, ratio: productsWithVideo / contentReadyTotal };
}

function toVnDateKey(value: string): string {
  return new Date(new Date(value).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function vnTodayKey(now: number): string {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function rendersPerDay(
  rows: readonly RenderEventRow[],
  days: number = TREND_DAYS,
  now: number = Date.now(),
): DayBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = toVnDateKey(row.created_at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = vnTodayKey(now);
  const buckets: DayBucket[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = new Date(new Date(`${today}T00:00:00Z`).getTime() - offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return buckets;
}

export function recentActivity(
  rows: readonly RenderEventRow[],
  names: ReadonlyMap<string, string>,
  limit: number = RECENT_LIMIT,
): ActivityRow[] {
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((row) => ({
      renderId: row.render_id,
      productId: row.product_id,
      productName: (row.product_id != null && names.get(row.product_id)) || "—",
      status: row.status,
      createdAt: row.created_at,
      totalDurationMs: row.total_duration_ms,
      hasVideo: row.video_bytes != null,
    }));
}

function throwOnError(result: DashboardQueryResult | NameQueryResult, fallback: string): void {
  if (result.error) throw new Error(result.error.code || result.error.message || fallback);
}

export const DASHBOARD_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

// Test-safe handler factory: route.ts (which carries `import "server-only"`)
// is never imported by a test; tests exercise this factory with a mocked
// getData instead.
export function createDashboardHandler(
  getData: () => Promise<DashboardData>,
): { GET(): Promise<Response> } {
  return {
    async GET(): Promise<Response> {
      try {
        return Response.json(await getData(), { headers: { ...DASHBOARD_HEADERS } });
      } catch {
        return Response.json(
          { error: { code: "DASHBOARD_FAILED" } },
          { status: 500, headers: { ...DASHBOARD_HEADERS } },
        );
      }
    },
  };
}

export async function getDashboardData(
  client: DashboardClient,
  scope: DashboardScope,
): Promise<DashboardData> {
  const since = new Date(Date.now() - RENDER_WINDOW_DAYS * 86_400_000).toISOString();
  const signal = AbortSignal.timeout(DASHBOARD_TIMEOUT_MS);

  const eventsResult = (await client
    .from("render_events")
    .select(
      "render_id,organization_id,product_id,status,error_stage,error_code,model,tokens_input,tokens_output,tokens_total,stage_timings,total_duration_ms,video_bytes,video_duration_ms,created_at",
    )
    .eq("organization_id", scope.organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000)
    .abortSignal(signal)) as unknown as DashboardQueryResult;
  throwOnError(eventsResult, "DASHBOARD_QUERY_FAILED");
  const rows = eventsResult.data ?? [];

  let contentReadyTotal = 0;
  try {
    const countResult = (await client
      .from("content_ready_products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", scope.organizationId)
      .eq("product_type", "laptop")
      .eq("quality", "usable")
      .eq("in_stock", true)
      .abortSignal(signal)) as unknown as DashboardQueryResult;
    throwOnError(countResult, "DASHBOARD_COUNT_FAILED");
    contentReadyTotal = countResult.count ?? 0;
  } catch {
    contentReadyTotal = 0;
  }

  const recentUnnamed = recentActivity(rows, new Map(), RECENT_LIMIT);
  const ids = [...new Set(recentUnnamed.flatMap((row) => (row.productId != null ? [row.productId] : [])))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const namesResult = (await client
        .from("products")
        .select("id,name")
        .eq("organization_id", scope.organizationId)
        .in("id", ids)
        .abortSignal(signal)) as unknown as NameQueryResult;
      throwOnError(namesResult, "DASHBOARD_NAMES_FAILED");
      for (const product of namesResult.data ?? []) names.set(product.id, product.name);
    } catch {
      // Missing/deleted products already render as "—".
    }
  }

  return {
    totalRenders: totalRenders(rows),
    successRate: successRate(rows),
    avgRenderDurationMs: avgRenderDurationMs(rows),
    aiTokens: aiTokenTotals(rows),
    coverage: catalogCoverage(rows, contentReadyTotal),
    trend: rendersPerDay(rows),
    recent: recentActivity(rows, names),
  };
}
