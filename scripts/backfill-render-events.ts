// SPDX-License-Identifier: Apache-2.0
//
// Thin CLI wrapper for the render_events backfill.
//
// Order: `pnpm supabase:reset` → `pnpm data:import` → this script → run the
// pre-recorded render live (`pnpm dev`, POST /api/renders), then do NOT reset
// again before the demo. `data:import` first so `products` rows exist for
// `recentActivity` names / `catalogCoverage` (no FK involved —
// `render_events.product_id` has none); the live run last so the insert-only
// upsert below never sees (and can never clobber) the rich live row.

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildBackfillRows } from "../src/lib/stats/backfill.ts";

function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return result;
}

const fileEnv = loadEnvFile();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error(
    "Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set.",
  );
}
const organizationId =
  process.env.ONEVOICE_ORGANIZATION_ID ||
  fileEnv.ONEVOICE_ORGANIZATION_ID ||
  "a0000000-0000-0000-0000-000000000001";
const mediaRoot =
  process.env.ONEVOICE_MEDIA_ROOT || fileEnv.ONEVOICE_MEDIA_ROOT || "renders";

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rows = await buildBackfillRows(
  path.resolve(process.cwd(), mediaRoot),
  organizationId,
);
if (rows.length === 0) {
  console.log("backfill: found=0 inserted=0 skipped=0");
} else {
  const { data, error } = await client
    .from("render_events")
    .upsert(rows, { onConflict: "render_id", ignoreDuplicates: true })
    .select("render_id");
  if (error) throw new Error(`backfill upsert failed: ${error.code} ${error.message}`);
  const inserted = data?.length ?? 0;
  const skipped = rows.length - inserted;
  console.log(`backfill: found=${rows.length} inserted=${inserted} skipped=${skipped}`);
}
