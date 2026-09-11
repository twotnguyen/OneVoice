// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
const { supabaseSelectMock } = vi.hoisted(() => ({ supabaseSelectMock: vi.fn() }));

vi.mock("node:child_process", () => ({ execFile: execFileMock }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: supabaseSelectMock }),
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FFMPEG_PATH = "ffmpeg";
  execFileMock.mockImplementation(
    (
      _file: unknown,
      _args: unknown,
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => {
      callback(null);
    },
  );
});

describe("GET /api/ready", () => {
  it("returns 200 when every dependency is ok", async () => {
    supabaseSelectMock.mockResolvedValue({ error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      service: "onevoice",
      checks: { supabase: "ok", ffmpeg: "ok" },
    });
  });

  it("returns 503 when a dependency fails", async () => {
    supabaseSelectMock.mockResolvedValue({ error: { message: "connection refused" } });

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.checks).toMatchObject({ supabase: "fail" });
  });
});
