// SPDX-License-Identifier: Apache-2.0
// Readiness probe nghiêm ngặt: 200 khi mọi dependency ok, 503 khi có check
// fail. Dùng cho orchestrator/gate deploy; khác với /api/health (liveness,
// luôn 200 để Compose healthcheck tương thích).

import { execFile } from "node:child_process";
import { withApiPermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHECK_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("READY_CHECK_TIMEOUT")), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function checkSupabase(): Promise<"ok" | "fail"> {
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

async function checkFfmpeg(): Promise<"ok" | "fail"> {
  const ffmpegPath = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        execFile(ffmpegPath, ["-version"], { timeout: CHECK_TIMEOUT_MS }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
      CHECK_TIMEOUT_MS,
    );
    return "ok";
  } catch {
    return "fail";
  }
}

export async function GET(request: Request): Promise<Response> {
  return withApiPermission(request, "manage_marketing", async () => {
  const [supabase, ffmpeg] = await Promise.all([checkSupabase(), checkFfmpeg()]);
  const ready = supabase === "ok" && ffmpeg === "ok";
  return Response.json(
    {
      status: ready ? "ok" : "degraded",
      service: "onevoice",
      checks: { supabase, ffmpeg },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
  });
}
