// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "./session";
const mocks = vi.hoisted(() => ({ actor: null as StaffSession | null, read: vi.fn(() => ({ runtime: { organizationId: "org", mediaRoot: "renders" } })), list: vi.fn(async () => ({ items: [], total: 0, totalPages: 1 })), detail: vi.fn(async () => null) }));
vi.mock("./session", () => ({ getStaffSession: async () => mocks.actor }));
vi.mock("./routes", () => ({ createAuthContext: async () => ({ session: async () => mocks.actor, finish: (response: Response) => response }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/env/server", () => ({ readServerEnv: mocks.read }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => { mocks.read(); return {}; } }));
vi.mock("@/lib/catalog/repository", () => ({ CatalogRepository: class { listStudioProducts = mocks.list; getProductDetail = mocks.detail; } }));
vi.mock("@/app/video-studio", () => ({ VideoStudio: () => null }));
vi.mock("@/app/(app)/catalog/catalog-client", () => ({ CatalogClient: () => null }));
vi.mock("@/app/(app)/history/history-client", () => ({ HistoryClient: () => null }));
vi.mock("@/app/(app)/funnel/funnel-client", () => ({ FunnelClient: () => null }));
vi.mock("@/app/(app)/dashboard/trend-chart", () => ({ TrendChart: () => null }));
vi.mock("server-only", () => ({}));
import Home from "@/app/(app)/page";
import Catalog from "@/app/(app)/catalog/page";
import Dashboard from "@/app/(app)/dashboard/page";
import History from "@/app/(app)/history/page";
import Funnel from "@/app/(app)/funnel/page";
const pages = [["/", Home], ["/catalog", Catalog], ["/dashboard", Dashboard], ["/history", History], ["/funnel", Funnel]] as const;
const staff: StaffSession = { userId: "u", organizationId: "org", role: "staff", displayName: "Test" };
beforeEach(() => { mocks.actor = null; vi.clearAllMocks(); });
describe("page and action entry points", () => {
  it.each(pages)("%s redirects anonymous before any data reads", async (path, page) => {
    await expect(Promise.resolve().then(() => page())).rejects.toThrow(`REDIRECT:/login?next=${encodeURIComponent(path)}`);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each(pages.filter(([path]) => path !== "/catalog"))("%s prevents staff from loading marketing data", async (_path, page) => {
    mocks.actor = staff;
    await expect(Promise.resolve().then(() => page())).rejects.toThrow("REDIRECT:/catalog");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("catalog actions independently reject a session lost after page render", async () => {
    mocks.actor = staff;
    const page = await Catalog();
    const props = page.props as { onFetchProductDetail: (id: string) => Promise<unknown>; onFetchProducts: (options: { page: number }) => Promise<unknown> };
    mocks.actor = null; vi.clearAllMocks();
    await expect(props.onFetchProductDetail("product-1")).rejects.toThrow("UNAUTHENTICATED");
    await expect(props.onFetchProducts({ page: 1 })).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
  });
});
