// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import {
  aiTokenTotals,
  avgRenderDurationMs,
  catalogCoverage,
  getDashboardData,
  recentActivity,
  rendersPerDay,
  successRate,
  totalRenders,
  type DashboardClient,
  type DashboardQueryResult,
  type NameQueryResult,
  type RenderEventRow,
} from "./aggregations";

const ORG = "a0000000-0000-0000-0000-000000000001";

function row(overrides: Partial<RenderEventRow> = {}): RenderEventRow {
  return {
    render_id: "b0000000-0000-4000-8000-000000000001",
    organization_id: ORG,
    product_id: null,
    status: "succeeded",
    error_stage: null,
    error_code: null,
    model: null,
    tokens_input: null,
    tokens_output: null,
    tokens_total: null,
    stage_timings: null,
    total_duration_ms: null,
    video_bytes: null,
    video_duration_ms: null,
    created_at: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("totalRenders", () => {
  it("counts all rows", () => {
    expect(totalRenders([row(), row(), row({ status: "failed" })])).toBe(3);
    expect(totalRenders([])).toBe(0);
  });
});

describe("successRate", () => {
  it("returns null for zero rows instead of NaN", () => {
    expect(successRate([])).toBeNull();
  });

  it("computes the succeeded fraction", () => {
    const rows = [row(), row({ status: "failed" }), row(), row({ status: "failed" })];
    expect(successRate(rows)).toBe(0.5);
  });
});

describe("avgRenderDurationMs", () => {
  it("returns null with no succeeded durations", () => {
    expect(avgRenderDurationMs([])).toBeNull();
    expect(avgRenderDurationMs([row({ status: "failed", total_duration_ms: 100 })])).toBeNull();
  });

  it("averages succeeded rows only", () => {
    const rows = [
      row({ total_duration_ms: 100 }),
      row({ total_duration_ms: 200 }),
      row({ status: "failed", total_duration_ms: 9999 }),
    ];
    expect(avgRenderDurationMs(rows)).toBe(150);
  });
});

describe("aiTokenTotals", () => {
  it("returns null when usage is absent everywhere", () => {
    expect(aiTokenTotals([row(), row({ model: "m" })])).toBeNull();
  });

  it("sums present fields, treating missing as zero", () => {
    const rows = [
      row({ tokens_input: 10, tokens_output: 20, tokens_total: 30 }),
      row({ tokens_input: 5 }),
    ];
    expect(aiTokenTotals(rows)).toEqual({ input: 15, output: 20, total: 30 });
  });
});

describe("catalogCoverage", () => {
  it("returns null for a zero denominator instead of dividing by zero", () => {
    expect(catalogCoverage([row({ product_id: "p1" })], 0)).toBeNull();
  });

  it("counts distinct succeeded product ids", () => {
    const rows = [
      row({ product_id: "p1" }),
      row({ product_id: "p1" }),
      row({ product_id: "p2" }),
      row({ product_id: "p3", status: "failed" }),
      row(),
    ];
    expect(catalogCoverage(rows, 10)).toEqual({
      productsWithVideo: 2,
      contentReadyTotal: 10,
      ratio: 0.2,
    });
  });
});

describe("rendersPerDay", () => {
  // 2026-09-10T00:00:00+07:00 == 2026-09-09T17:00:00Z
  const now = new Date("2026-09-10T12:00:00+07:00").getTime();

  it("gap-fills 14 buckets with zeros for empty days", () => {
    const buckets = rendersPerDay([], 14, now);
    expect(buckets).toHaveLength(14);
    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
    expect(buckets.at(-1)?.date).toBe("2026-09-10");
    expect(buckets[0]?.date).toBe("2026-08-28");
  });

  it("buckets by +07:00 so a late-UTC render lands on the VN day", () => {
    const rows = [
      row({ created_at: "2026-09-09T18:00:00.000Z" }), // 2026-09-10 01:00 +07:00
      row({ created_at: "2026-09-09T16:00:00.000Z" }), // 2026-09-09 23:00 +07:00
    ];
    const buckets = rendersPerDay(rows, 14, now);
    expect(buckets.find((bucket) => bucket.date === "2026-09-10")?.count).toBe(1);
    expect(buckets.find((bucket) => bucket.date === "2026-09-09")?.count).toBe(1);
    expect(buckets.filter((bucket) => bucket.count > 0)).toHaveLength(2);
  });
});

describe("recentActivity", () => {
  it("orders newest first, limits, and maps missing names to —", () => {
    const rows = [
      row({ render_id: "r-old", created_at: "2026-09-08T00:00:00.000Z", product_id: "p1" }),
      row({ render_id: "r-new", created_at: "2026-09-09T00:00:00.000Z", product_id: "p-missing", video_bytes: 10 }),
    ];
    const [first, second] = recentActivity(rows, new Map([["p1", "Laptop A"]]), 20);
    expect(first?.renderId).toBe("r-new");
    expect(first?.productName).toBe("—");
    expect(first?.hasVideo).toBe(true);
    expect(second?.productName).toBe("Laptop A");
    expect(second?.hasVideo).toBe(false);
  });

  it("caps at the limit", () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      row({
        render_id: `r-${index}`,
        created_at: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    expect(recentActivity(rows, new Map(), 20)).toHaveLength(20);
  });
});

describe("getDashboardData", () => {
  const events: DashboardQueryResult = {
    data: [
      row({ render_id: "r1", product_id: "p1", total_duration_ms: 100, tokens_input: 5, tokens_total: 5, video_bytes: 7 }),
      row({ render_id: "r2", status: "failed", error_stage: "s", error_code: "C", total_duration_ms: 50 }),
    ],
    error: null,
    count: null,
  };
  const count: DashboardQueryResult = { data: [], error: null, count: 4 };
  const names: NameQueryResult = { data: [{ id: "p1", name: "Laptop A" }], error: null };

  function stubClient(seen: { signals: unknown[]; tables: string[] }): DashboardClient {
    const responses = [events, count, names];
    let call = 0;
    let currentTable = "";
    const query = new Proxy(
      {},
      {
        get: (_target, property: string) => {
          if (property === "abortSignal") {
            return (signal: AbortSignal) => {
              seen.signals.push(signal);
              seen.tables.push(currentTable);
              const response = responses[Math.min(call, responses.length - 1)];
              call += 1;
              return Promise.resolve(response);
            };
          }
          return () => query;
        },
      },
    );
    return {
      from: (table: string) => {
        currentTable = table;
        return { select: () => query };
      },
    } as unknown as DashboardClient;
  }

  it("assembles the dashboard shape with an abort signal on every query", async () => {
    const seen = { signals: [] as unknown[], tables: [] as string[] };
    const data = await getDashboardData(stubClient(seen), { organizationId: ORG });

    expect(seen.tables).toEqual(["render_events", "content_ready_products", "products"]);
    expect(seen.signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(data.totalRenders).toBe(2);
    expect(data.successRate).toBe(0.5);
    expect(data.avgRenderDurationMs).toBe(100);
    expect(data.aiTokens).toEqual({ input: 5, output: 0, total: 5 });
    expect(data.coverage).toEqual({ productsWithVideo: 1, contentReadyTotal: 4, ratio: 0.25 });
    expect(data.trend).toHaveLength(14);
    expect(data.recent).toHaveLength(2);
    expect(data.recent[0]?.productName).toBe("Laptop A");
  });

  it("exposes no secret or filesystem path carried by row fields the payload drops", async () => {
    const tainted: DashboardQueryResult = {
      data: [
        row({
          render_id: "r1",
          model: "secret-token",
          error_stage: "/private/work",
          error_code: "/private/media secret-token",
          stage_timings: { loading_product_ms: 3 },
        }),
      ],
      error: null,
      count: null,
    };
    const client = {
      from: (table: string) => ({
        select: () => {
          const query = new Proxy(
            {},
            {
              get: (_t, property: string) => {
                if (property === "abortSignal") {
                  return () => {
                    if (table === "content_ready_products") {
                      return Promise.resolve({ data: [], error: null, count: 0 });
                    }
                    if (table === "products") {
                      return Promise.resolve({ data: [], error: null });
                    }
                    return Promise.resolve(tainted);
                  };
                }
                return () => query;
              },
            },
          );
          return query;
        },
      }),
    } as unknown as DashboardClient;
    const data = await getDashboardData(client, { organizationId: ORG });
    expect(JSON.stringify(data)).not.toMatch(/secret-token|\/private\//);
  });

  it("degrades to null coverage when the count query fails", async () => {
    const failing = {
      from: (table: string) => ({
        select: () => {
          const query = new Proxy(
            {},
            {
              get: (_t, property: string) => {
                if (property === "abortSignal") {
                  return () => {
                    if (table === "content_ready_products") {
                      return Promise.resolve({
                        data: null,
                        error: { code: "XX", message: "boom" },
                        count: null,
                      });
                    }
                    if (table === "products") {
                      return Promise.resolve({ data: [], error: null });
                    }
                    return Promise.resolve(events);
                  };
                }
                return () => query;
              },
            },
          );
          return query;
        },
      }),
    } as unknown as DashboardClient;

    const data = await getDashboardData(failing, { organizationId: ORG });
    expect(data.coverage).toBeNull();
    expect(data.totalRenders).toBe(2);
  });

  it("throws when the bounded select itself fails", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: () => ({
                  abortSignal: () =>
                    Promise.resolve({ data: null, error: { code: "500", message: "db down" }, count: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as DashboardClient;
    await expect(getDashboardData(failing, { organizationId: ORG })).rejects.toThrow("500");
  });

  it("uses AbortSignal.timeout", () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const seen = { signals: [] as unknown[], tables: [] as string[] };
    return getDashboardData(stubClient(seen), { organizationId: ORG }).then(() => {
      expect(spy).toHaveBeenCalledWith(3000);
      spy.mockRestore();
    });
  });
});
