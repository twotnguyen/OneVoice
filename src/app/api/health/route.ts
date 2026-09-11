// SPDX-License-Identifier: Apache-2.0
// Liveness probe: luôn trả HTTP 200 để Compose healthcheck
// (`fetch(...).then(r=>{if(!r.ok)...})`) tương thích, kể cả khi dependency
// fail. Kiểm tra Supabase (select 1) và `ffmpeg -version` song song; khi có
// check fail thì `status: "degraded"` thay vì `"ok"`. Readiness nghiêm ngặt
// (200/503) nằm ở /api/ready.

import { execFile } from "node:child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHECK_TIMEOUT_MS = 3_000;

type CheckState = "ok" | "fail";

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("HEALTH_CHECK_TIMEOUT")), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function checkSupabase(): Promise<CheckState> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const client = createSupabaseServerClient();
    const result = await withTimeout(
      client.from("products").select("id", { count: "exact", head: true }),
      CHECK_TIMEOUT_MS,
    );
    return result.error ? "fail" : "ok";
  } catch {
    return "fail";
  }
}

async function checkFfmpeg(): Promise<{ state: CheckState; version?: string }> {
  const ffmpegPath = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  try {
    const stdout = await withTimeout(
      new Promise<string>((resolve, reject) => {
        execFile(ffmpegPath, ["-version"], { timeout: CHECK_TIMEOUT_MS }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      }),
      CHECK_TIMEOUT_MS,
    );
    const firstLine = stdout.split("\n", 1)[0]?.trim();
    return firstLine ? { state: "ok", version: firstLine.slice(0, 120) } : { state: "fail" };
  } catch {
    return { state: "fail" };
  }
}

export async function GET(): Promise<Response> {
  const [supabase, ffmpeg] = await Promise.all([checkSupabase(), checkFfmpeg()]);
  const status = supabase === "ok" && ffmpeg.state === "ok" ? "ok" : "degraded";
  return Response.json(
    {
      status,
      service: "onevoice",
      checks: {
        supabase,
        ffmpeg: ffmpeg.state,
        ...(ffmpeg.version ? { ffmpegVersion: ffmpeg.version } : {}),
      },
    },
    {
      // Cố ý luôn 200: Compose healthcheck chỉ kiểm tra r.ok.
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
