// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "./session";
const mocks = vi.hoisted(() => ({ actor: null as StaffSession | null, compose: vi.fn<() => unknown>(() => { throw Error("PROTECTED_COMPOSITION_REACHED"); }), service: vi.fn(() => { throw Error("PROTECTED_SERVICE_REACHED"); }) }));
vi.mock("./routes", () => ({ createAuthContext: async () => ({ session: async () => mocks.actor, finish: (response: Response) => response }) }));
vi.mock("./config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/render/composition-root", () => ({ getComposition: mocks.compose }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.service }));
vi.mock("@/lib/env/server", () => ({ readServerEnv: mocks.service }));
vi.mock("node:child_process", () => ({ execFile: mocks.service }));
vi.mock("server-only", () => ({}));
import { GET as products } from "@/app/api/products/route";
import { POST as render } from "@/app/api/renders/route";
import { GET as status } from "@/app/api/renders/[renderId]/route";
import { GET as video, HEAD as videoHead } from "@/app/api/renders/[renderId]/video/route";
import { GET as download, HEAD as downloadHead } from "@/app/api/renders/[renderId]/download/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as ready } from "@/app/api/ready/route";
const context = { params: Promise.resolve({ renderId: "a0000000-0000-4000-8000-000000000001" }) };
const request = (method = "GET", origin = "https://app.test") => new Request("https://app.test/api/test", { method, headers: { origin, range: "bytes=0-10" } });
const entrypoints = [
  ["products", () => products(request())], ["render", () => render(request("POST"))],
  ["status", () => status(request(), context)], ["video range", () => video(request(), context)],
  ["video HEAD", () => videoHead(request("HEAD"), context)], ["download range", () => download(request(), context)],
  ["download HEAD", () => downloadHead(request("HEAD"), context)], ["dashboard", () => dashboard(request())], ["ready", () => ready(request())],
] as const;
beforeEach(() => { mocks.actor = null; vi.clearAllMocks(); });
describe("actual exported protected handlers", () => {
  it.each(entrypoints)("%s denies anonymous before composition or service access", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401); expect(mocks.compose).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(entrypoints.filter(([name]) => name !== "products"))("%s denies staff before composition or service access", async (_name, call) => {
    mocks.actor = { userId: "staff", organizationId: "org", role: "staff", displayName: "Test" };
    expect((await call()).status).toBe(403); expect(mocks.compose).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("the exported render POST rejects cross-origin manager requests before composition", async () => {
    mocks.actor = { userId: "manager", organizationId: "org", role: "manager", displayName: "Test" };
    expect((await render(request("POST", "https://outside.invalid"))).status).toBe(403);
    expect(mocks.compose).not.toHaveBeenCalled();
  });
  it("staff can use the exported catalog endpoint", async () => {
    mocks.actor = { userId: "staff", organizationId: "org", role: "staff", displayName: "Test" };
    mocks.compose.mockReturnValueOnce({ scope: { organizationId: "org" }, catalog: { listStudioProducts: async () => ({ items: [{ id: "fixture-product" }], total: 1 }) } });
    const response = await products(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: "fixture-product" }], total: 1 });
  });
  it("a manager can enqueue through the exported POST with only server organization scope", async () => {
    mocks.actor = { userId: "manager", organizationId: "org", role: "manager", displayName: "Test" };
    const jobs: unknown[] = [];
    mocks.compose.mockReturnValueOnce({ scope: { organizationId: "org" }, queue: { enqueue: async (job: unknown) => { jobs.push(job); } } });
    const response = await render(new Request("https://app.test/api/renders", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify({ renderId: "a0000000-0000-4000-8000-000000000002", productId: "a0000000-0000-4000-8000-000000000003", organizationId: "untrusted" }) }));
    expect(response.status).toBe(202);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ organizationId: "org", status: "queued" });
  });
  it.each([["video", video, videoHead], ["download", download, downloadHead]] as const)("authorized %s retains byte-range and HEAD semantics", async (_name, get, head) => {
    mocks.actor = { userId: "manager", organizationId: "org", role: "manager", displayName: "Test" };
    const fixture = new Uint8Array([1, 2, 3, 4]);
    const composition = { library: { readVideo: async () => ({ size: 4, async *stream(start: number, end: number) { yield fixture.slice(start, end + 1); }, close: async () => {} }) } };
    mocks.compose.mockReturnValueOnce(composition);
    const response = await get(new Request("https://app.test/media", { headers: { range: "bytes=1-2" } }), context);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
    mocks.compose.mockReturnValueOnce(composition);
    const headResponse = await head(new Request("https://app.test/media", { method: "HEAD" }), context);
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-length")).toBe("4");
    expect(await headResponse.text()).toBe("");
  });
});
