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

const FFMPEG_VERSION_OUTPUT = "ffmpeg version 7.1.1 Copyright (c) 2000-2025";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SECRET_KEY = "test-secret-must-never-leak";
  process.env.FFMPEG_PATH = "ffmpeg";
});

function mockExecFileSuccess(): void {
  execFileMock.mockImplementation(
    (
      _file: unknown,
      _args: unknown,
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(null, FFMPEG_VERSION_OUTPUT);
    },
  );
}

describe("GET /api/health", () => {
  it("reports ok with dependency checks without exposing configuration", async () => {
    supabaseSelectMock.mockResolvedValue({ error: null });
    mockExecFileSuccess();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "onevoice",
      checks: {
        supabase: "ok",
        ffmpeg: "ok",
        ffmpegVersion: FFMPEG_VERSION_OUTPUT,
      },
    });
    expect(JSON.stringify(body)).not.toContain("test-secret-must-never-leak");
  });

  it("stays HTTP 200 with degraded status for Compose compatibility when a dependency fails", async () => {
    supabaseSelectMock.mockResolvedValue({ error: { message: "connection refused" } });
    mockExecFileSuccess();

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.checks).toMatchObject({ supabase: "fail", ffmpeg: "ok" });
  });

  it("reports ffmpeg fail when the binary is unavailable", async () => {
    supabaseSelectMock.mockResolvedValue({ error: null });
    execFileMock.mockImplementation(
      (
        _file: unknown,
        _args: unknown,
        _options: unknown,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        callback(new Error("spawn ffmpeg ENOENT"), "");
      },
    );

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.checks).toMatchObject({ supabase: "ok", ffmpeg: "fail" });
  });
});
