// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
const forbidden = vi.hoisted(() => vi.fn(() => { throw Error("PUBLIC_DEPENDENCY_ACCESS"); }));
vi.mock("node:child_process", () => ({ execFile: forbidden }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: forbidden }));
import { GET } from "./route";
it("public liveness exposes only process status and never checks private dependencies", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", service: "onevoice" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(forbidden).not.toHaveBeenCalled();
});
