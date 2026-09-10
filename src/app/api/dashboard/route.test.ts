// SPDX-License-Identifier: Apache-2.0
//
// The route module itself carries `import "server-only"` (not an installed
// package — vitest cannot collect it), so this test exercises the same
// createDashboardHandler factory the route delegates to, with getDashboardData
// mocked.

import { describe, expect, it, vi } from "vitest";

import { createDashboardHandler, type DashboardData } from "@/lib/stats/aggregations";

const SECRET = "secret-token";
const PATH_SENTINEL = "/private/media";

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    totalRenders: 2,
    successRate: 0.5,
    avgRenderDurationMs: 100,
    aiTokens: { input: 5, output: 0, total: 5 },
    coverage: { productsWithVideo: 1, contentReadyTotal: 4, ratio: 0.25 },
    trend: [{ date: "2026-09-10", count: 2 }],
    recent: [
      {
        renderId: "r1",
        productId: "p1",
        productName: "Laptop A",
        status: "succeeded",
        createdAt: "2026-09-09T10:00:00.000Z",
        totalDurationMs: 100,
        hasVideo: true,
      },
    ],
    ...overrides,
  };
}

describe("GET /api/dashboard", () => {
  it("returns the dashboard shape with no-store headers", async () => {
    const getDashboardData = vi.fn(async () => dashboardData());
    const response = await createDashboardHandler(getDashboardData).GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const payload = await response.json();
    expect(payload.totalRenders).toBe(2);
    expect(payload.recent).toHaveLength(1);
    expect(getDashboardData).toHaveBeenCalledTimes(1);
  });

  it("renders clean zeros for empty input", async () => {
    const getDashboardData = vi.fn(async () =>
      dashboardData({
        totalRenders: 0,
        successRate: null,
        avgRenderDurationMs: null,
        aiTokens: null,
        coverage: null,
        trend: [],
        recent: [],
      }),
    );
    const response = await createDashboardHandler(getDashboardData).GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ totalRenders: 0, successRate: null, aiTokens: null, recent: [] });
  });

  it("passes the mocked payload through without adding secrets or paths", async () => {
    const expected = dashboardData();
    const getDashboardData = vi.fn(async () => expected);
    const response = await createDashboardHandler(getDashboardData).GET();
    const payload = await response.json();
    expect(payload).toEqual(expected);
    expect(JSON.stringify(payload)).not.toMatch(/secret-token|\/private\//);
  });

  it("maps a thrown error carrying sentinels to a safe code-only 500", async () => {
    const getDashboardData = vi.fn(async (): Promise<DashboardData> => {
      throw new Error(`db down ${SECRET} ${PATH_SENTINEL}/video.mp4`);
    });
    const response = await createDashboardHandler(getDashboardData).GET();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload).toEqual({ error: { code: "DASHBOARD_FAILED" } });
    expect(JSON.stringify(payload)).not.toMatch(/secret-token|\/private\//);
  });
});
