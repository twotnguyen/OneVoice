// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { requirePagePermission } from "@/lib/auth/guards";

import { readServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocalVideoLibrary } from "@/lib/video/local-video-library";

import { HistoryClient, type HistoryItem, type VideoScriptContent } from "./history-client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requirePagePermission("manage_marketing", "/history");
  const { runtime } = readServerEnv();
  const mediaRoot = path.isAbsolute(runtime.mediaRoot)
    ? runtime.mediaRoot
    : path.resolve(process.cwd(), runtime.mediaRoot);
  const library = new LocalVideoLibrary(mediaRoot);

  const supabase = createSupabaseServerClient();

  // 1. Query render_events
  let query = supabase
    .from("render_events")
    .select(
      "render_id, product_id, status, error_stage, error_code, video_duration_ms, video_bytes, created_at, model, scene_count"
    )
    .order("created_at", { ascending: false });

  if (runtime.organizationId) {
    query = query.eq("organization_id", runtime.organizationId);
  }

  const { data: renderEvents, error: eventsError } = await query;
  if (eventsError) {
    console.error("[history] Failed to query render_events from Supabase:", eventsError);
  }

  const rows = renderEvents ?? [];

  // 2. Query products for the products in render_events
  const productIds = [
    ...new Set(
      rows
        .map((r) => r.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const productMap = new Map<
    string,
    Readonly<{
      id: string;
      name: string;
      brand: string | null;
      sku: string | null;
      price_vnd: number | null;
    }>
  >();

  if (productIds.length > 0) {
    let productQuery = supabase
      .from("products")
      .select("id, name, brand, sku, price_vnd")
      .in("id", productIds);

    if (runtime.organizationId) {
      productQuery = productQuery.eq("organization_id", runtime.organizationId);
    }

    const { data: products, error: productsError } = await productQuery;
    if (productsError) {
      console.error("[history] Failed to query products from Supabase:", productsError);
    } else if (products) {
      for (const product of products) {
        productMap.set(product.id, product);
      }
    }
  }

  // 3. Check disk existence and read manifest for each render
  const items: HistoryItem[] = await Promise.all(
    rows.map(async (row) => {
      const product = row.product_id ? productMap.get(row.product_id) : undefined;

      let hasVideo = false;
      try {
        hasVideo = await library.videoExists(row.render_id);
      } catch {
        hasVideo = false;
      }

      let script: VideoScriptContent | null = null;
      let manifestDurationMs: number | null = null;
      let manifestBytes: number | null = null;

      try {
        const manifest = await library.getRun(row.render_id);
        if (manifest?.content) {
          script = {
            hook: manifest.content.hook,
            caption: manifest.content.caption,
            cta: manifest.content.cta,
          };
        }
        if (manifest?.status === "succeeded" && manifest.artifact) {
          manifestDurationMs = manifest.artifact.durationMs;
          manifestBytes = manifest.artifact.bytes;
        }
      } catch {
        script = null;
      }

      const rawBytes = row.video_bytes ?? manifestBytes;
      const parsedBytes =
        typeof rawBytes === "number"
          ? rawBytes
          : typeof rawBytes === "string"
            ? parseInt(rawBytes, 10)
            : null;

      const fallbackTitle =
        script?.hook || (row.product_id ? "Sản phẩm không khả dụng" : "Bản ghi demo video");

      return {
        renderId: row.render_id,
        productId: row.product_id,
        productName: product?.name ?? fallbackTitle,
        brand: product?.brand ?? null,
        sku: product?.sku ?? null,
        priceVnd: product?.price_vnd ?? null,
        status: row.status,
        errorStage: row.error_stage,
        errorCode: row.error_code,
        videoDurationMs: row.video_duration_ms ?? manifestDurationMs,
        videoBytes: Number.isNaN(parsedBytes) ? null : parsedBytes,
        createdAt: row.created_at,
        model: row.model,
        sceneCount: row.scene_count,
        hasVideo,
        script,
      };
    })
  );

  return <HistoryClient items={items} />;
}
