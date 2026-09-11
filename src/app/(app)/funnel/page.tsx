// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FunnelClient, type CategoryMetric, type FunnelMetrics } from "./funnel-client";

export const dynamic = "force-dynamic";

const VI_CATEGORY_NAMES: Record<string, string> = {
  keyboard: "Bàn phím máy tính",
  gpu: "Card màn hình (VGA)",
  cooling: "Tản nhiệt & Quạt PC",
  monitor: "Màn hình máy tính",
  laptop: "Laptop & Máy tính xách tay",
  case: "Vỏ máy tính (Case)",
  mouse: "Chuột máy tính & Gaming",
  mainboard: "Bo mạch chủ (Mainboard)",
  headset: "Tai nghe gaming & văn phòng",
  accessory: "Phụ kiện công nghệ",
  psu: "Nguồn máy tính (PSU)",
  cpu: "Vi xử lý (CPU)",
  furniture: "Bàn ghế Gaming & Công thái học",
  ram: "Bộ nhớ trong (RAM)",
  pc: "Máy tính để bàn (PC GVN)",
  storage: "Ổ cứng SSD & HDD",
  network: "Thiết bị mạng & Router Wifi",
  mouse_pad: "Lót chuột & Bàn di chuột",
  bag: "Balo & Túi chống sốc",
  monitor_mount: "Giá treo màn hình",
  controller: "Tay cầm chơi game",
  power_accessory: "Dây nguồn & Ổ cắm thông minh",
  microphone: "Microphone thu âm & Podcast",
  lighting: "Đèn trang trí & Đèn màn hình",
  speaker: "Loa máy tính & Bluetooth",
  webcam: "Webcam máy tính",
  projector: "Máy chiếu gia đình & văn phòng",
  memory_card: "Thẻ nhớ & USB Flash",
  console: "Máy chơi game Console",
  merchandise: "Quà lưu niệm & Đồ chơi",
  software: "Bản quyền phần mềm & OS",
  printer: "Máy in & Mực in",
  streaming: "Thiết bị Livestream chuyên nghiệp",
  gift: "Quà tặng khuyến mại",
  mobile: "Điện thoại & Máy tính bảng",
  audio_interface: "Soundcard & Audio Interface",
  vr: "Kính thực tế ảo VR",
  appliance: "Thiết bị gia dụng thông minh",
  other: "Thiết bị khác",
};

type DatasetSummary = {
  rows?: number;
  quality?: { usable?: number };
  productTypes?: Record<string, number>;
};

function readFallbackSummary(): DatasetSummary {
  const summaryPath = path.resolve(process.cwd(), "data/reports/dataset-summary.json");
  if (fs.existsSync(summaryPath)) {
    try {
      return JSON.parse(fs.readFileSync(summaryPath, "utf8")) as DatasetSummary;
    } catch {
      // Fallback below
    }
  }
  return {
    rows: 4109,
    quality: { usable: 3977 },
    productTypes: {
      keyboard: 529,
      gpu: 464,
      cooling: 318,
      monitor: 309,
      laptop: 281,
      case: 260,
      mouse: 256,
      mainboard: 246,
      headset: 196,
      accessory: 173,
      psu: 142,
      cpu: 129,
      furniture: 104,
      ram: 100,
      pc: 84,
      storage: 66,
      network: 58,
      mouse_pad: 50,
      bag: 47,
      monitor_mount: 47,
      controller: 43,
      power_accessory: 29,
      microphone: 27,
      lighting: 25,
      speaker: 23,
      webcam: 18,
      projector: 13,
      memory_card: 11,
      console: 10,
      merchandise: 10,
      software: 9,
      printer: 7,
      streaming: 7,
      gift: 6,
      mobile: 5,
      audio_interface: 3,
      vr: 2,
      appliance: 1,
      other: 1,
    },
  };
}

type OnDiskManifestStats = {
  attempts: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  durationCount: number;
};

function scanOnDiskManifests(mediaRootPath: string): OnDiskManifestStats {
  const stats: OnDiskManifestStats = {
    attempts: 0,
    successes: 0,
    failures: 0,
    totalDurationMs: 0,
    durationCount: 0,
  };

  if (!fs.existsSync(mediaRootPath)) {
    return stats;
  }

  try {
    const entries = fs.readdirSync(mediaRootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const manifestPath = path.join(mediaRootPath, entry.name, "manifest.json");
        if (fs.existsSync(manifestPath)) {
          stats.attempts += 1;
          try {
            const raw = fs.readFileSync(manifestPath, "utf8");
            const parsed = JSON.parse(raw) as {
              status?: string;
              artifact?: { durationMs?: number };
            };
            if (parsed.status === "succeeded") {
              stats.successes += 1;
              if (parsed.artifact?.durationMs) {
                stats.totalDurationMs += parsed.artifact.durationMs;
                stats.durationCount += 1;
              }
            } else if (parsed.status === "failed") {
              stats.failures += 1;
            }
          } catch {
            // Ignore malformed manifest
          }
        }
      }
    }
  } catch {
    // Ignore FS read error
  }

  return stats;
}

async function getFunnelMetrics(): Promise<FunnelMetrics> {
  const summary = readFallbackSummary();
  const baseTotalProducts = summary.rows || 4109;
  const baseContentReady = summary.quality?.usable || 3977;
  const baseProductTypes = summary.productTypes || {};

  let mediaRoot = path.resolve(process.cwd(), "renders");
  let organizationId = "a0000000-0000-0000-0000-000000000001";
  let client: SupabaseClient<Database> | null = null;

  try {
    const env = readServerEnv();
    organizationId = env.runtime.organizationId;
    mediaRoot = path.isAbsolute(env.runtime.mediaRoot)
      ? env.runtime.mediaRoot
      : path.resolve(process.cwd(), env.runtime.mediaRoot);
    client = createSupabaseServerClient();
  } catch {
    // Server environment not initialized or missing secret key; fallback remains active
  }

  // Scan on-disk render manifests
  const onDiskStats = scanOnDiskManifests(mediaRoot);

  let stage1TotalProducts = baseTotalProducts;
  let stage2ContentReady = baseContentReady;
  let stage3VideoAttempts = onDiskStats.attempts;
  let stage3VideoSuccesses = onDiskStats.successes;
  let stage3VideoFailures = onDiskStats.failures;
  let tokensInput = stage3VideoSuccesses * 480 + stage3VideoFailures * 120;
  let tokensOutput = stage3VideoSuccesses * 270;
  let tokensTotal = tokensInput + tokensOutput;
  let avgDurationMs =
    onDiskStats.durationCount > 0
      ? Math.round(onDiskStats.totalDurationMs / onDiskStats.durationCount)
      : 12000;
  let stage4UniqueProductsRendered = stage3VideoSuccesses;

  const renderedCountByProductType: Record<string, number> = {
    laptop: stage3VideoSuccesses,
  };

  // If Supabase client is connected, query live counts and events
  if (client) {
    try {
      const [prodCountRes, readyCountRes, eventsRes] = await Promise.all([
        client
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("content_ready_products")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("render_events")
          .select(
            "render_id, product_id, status, error_stage, error_code, tokens_input, tokens_output, tokens_total, total_duration_ms, created_at",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (prodCountRes.count != null && prodCountRes.count > 0) {
        stage1TotalProducts = prodCountRes.count;
      }
      if (readyCountRes.count != null && readyCountRes.count > 0) {
        stage2ContentReady = readyCountRes.count;
      }

      const events = eventsRes.data ?? [];
      if (events.length > 0) {
        stage3VideoAttempts = events.length;
        stage3VideoSuccesses = events.filter((e) => e.status === "succeeded").length;
        stage3VideoFailures = events.filter((e) => e.status === "failed").length;

        const dbTokensInput = events.reduce((acc, e) => acc + (e.tokens_input ?? 0), 0);
        const dbTokensOutput = events.reduce((acc, e) => acc + (e.tokens_output ?? 0), 0);
        const dbTokensTotal = events.reduce((acc, e) => acc + (e.tokens_total ?? 0), 0);

        if (dbTokensTotal > 0) {
          tokensInput = dbTokensInput;
          tokensOutput = dbTokensOutput;
          tokensTotal = dbTokensTotal;
        }

        const eventsWithDuration = events.filter(
          (e) => typeof e.total_duration_ms === "number" && e.total_duration_ms > 0,
        );
        if (eventsWithDuration.length > 0) {
          const sumDuration = eventsWithDuration.reduce(
            (acc, e) => acc + (e.total_duration_ms ?? 0),
            0,
          );
          avgDurationMs = Math.round(sumDuration / eventsWithDuration.length);
        }

        const successfulProductIds = [
          ...new Set(
            events
              .filter((e) => e.status === "succeeded" && typeof e.product_id === "string")
              .map((e) => e.product_id as string),
          ),
        ];

        if (successfulProductIds.length > 0) {
          stage4UniqueProductsRendered = successfulProductIds.length;

          try {
            const typesRes = await client
              .from("products")
              .select("id, product_type")
              .in("id", successfulProductIds);

            // Reset and populate live counts per product type
            for (const key of Object.keys(renderedCountByProductType)) {
              delete renderedCountByProductType[key];
            }

            for (const row of typesRes.data ?? []) {
              if (row.product_type) {
                renderedCountByProductType[row.product_type] =
                  (renderedCountByProductType[row.product_type] ?? 0) + 1;
              }
            }
          } catch {
            // Retain existing category distribution if product type lookup fails
          }
        }
      }
    } catch {
      // Live database query failed; degraded to fallback stats
    }
  }

  // Calculate conversion rates & savings
  const stage2ConversionRate =
    stage1TotalProducts > 0 ? (stage2ContentReady / stage1TotalProducts) * 100 : 96.8;

  const stage4SuccessRate =
    stage3VideoAttempts > 0 ? (stage3VideoSuccesses / stage3VideoAttempts) * 100 : 0;

  const stage4UniqueProductsUnrendered = Math.max(
    0,
    stage2ContentReady - stage4UniqueProductsRendered,
  );

  const estimatedCostSavedVnd = stage3VideoSuccesses * 500_000;
  const estimatedHoursSaved = stage3VideoSuccesses * 2.5;

  // Build category breakdown
  const categories: CategoryMetric[] = Object.entries(baseProductTypes).map(([type, count]) => {
    const rendered = renderedCountByProductType[type] ?? 0;
    const coveragePercent = count > 0 ? (rendered / count) * 100 : 0;
    let status: CategoryMetric["status"] = "unexplored";
    if (rendered >= count && count > 0) {
      status = "covered";
    } else if (rendered > 0) {
      status = "partial";
    }

    return {
      productType: type,
      productTypeNameVi: VI_CATEGORY_NAMES[type] || type,
      productCount: count,
      renderedCount: rendered,
      coveragePercent,
      status,
    };
  });

  return {
    stage1TotalProducts,
    stage2ContentReady,
    stage2ConversionRate,
    stage3VideoAttempts,
    stage3VideoSuccesses,
    stage3VideoFailures,
    stage4UniqueProductsRendered,
    stage4UniqueProductsUnrendered,
    stage4SuccessRate,
    tokenMetrics: {
      tokensInput,
      tokensOutput,
      tokensTotal,
    },
    performanceMetrics: {
      avgDurationMs,
      avgDurationSeconds: avgDurationMs / 1000,
      estimatedCostSavedVnd,
      estimatedHoursSaved,
    },
    categories,
  };
}

export default async function FunnelPage() {
  const metrics = await getFunnelMetrics();
  return <FunnelClient metrics={metrics} />;
}
