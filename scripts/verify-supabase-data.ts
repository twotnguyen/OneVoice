// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types.ts";

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

const env = loadEnvFile();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set.");
  process.exit(1);
}

const client = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_EXPECTED_PATH = path.resolve(process.cwd(), "data/reports/dataset-summary.json");

function parseExpectedFlag(argv: string[]): string | null {
  const index = argv.findIndex((arg) => arg === "--expected" || arg.startsWith("--expected="));
  if (index === -1) return null;
  const flag = argv[index];
  return flag.includes("=") ? flag.slice("--expected=".length) : (argv[index + 1] ?? null);
}

export interface ExpectedCounts {
  source: string;
  total: number;
  usable: number;
  partial: number;
  identityOnly: number;
  inStock: number;
  outOfStock: number;
  contentReady: number;
  missingPrice: number;
  missingImages: number;
  negativeStock: number;
}

const FALLBACK_EXPECTED: ExpectedCounts = {
  source: "built-in fallback",
  total: 4109,
  usable: 3977,
  partial: 82,
  identityOnly: 50,
  inStock: 1506,
  outOfStock: 2603,
  contentReady: 1455,
  missingPrice: 0,
  missingImages: 0,
  negativeStock: 0,
};

function finiteCount(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/**
 * Đọc kỳ vọng từ data/reports/dataset-summary.json (hoặc file --expected trỏ tới).
 * contentReady = usable còn hàng (qualityByAvailability.inStock.usable).
 * File thiếu/sai schema thì fallback về hằng số built-in và cảnh báo rõ.
 */
export function loadExpectedCounts(expectedPath: string = DEFAULT_EXPECTED_PATH): ExpectedCounts {
  try {
    const raw = fs.readFileSync(expectedPath, "utf8");
    const summary = JSON.parse(raw) as {
      rows?: unknown;
      quality?: { usable?: unknown; partial?: unknown; identity_only?: unknown };
      qualityByAvailability?: { inStock?: { usable?: unknown } };
      availability?: { [key: string]: unknown };
      price?: { missingOrZero?: unknown };
      issues?: { missingImages?: unknown };
    };
    const total = finiteCount(summary.rows);
    const usable = finiteCount(summary.quality?.usable);
    const partial = finiteCount(summary.quality?.partial);
    const identityOnly = finiteCount(summary.quality?.identity_only);
    const contentReady = finiteCount(summary.qualityByAvailability?.inStock?.usable);
    const inStock = finiteCount(summary.availability?.["https://schema.org/InStock"]);
    const outOfStock = finiteCount(summary.availability?.["https://schema.org/OutOfStock"]);
    const missingPrice = finiteCount(summary.price?.missingOrZero);
    const missingImages = finiteCount(summary.issues?.missingImages);
    if (
      total === null || usable === null || partial === null || identityOnly === null ||
      contentReady === null || inStock === null || outOfStock === null ||
      missingPrice === null || missingImages === null
    ) {
      throw new Error("dataset-summary schema mismatch");
    }
    return {
      source: expectedPath,
      total, usable, partial, identityOnly, inStock, outOfStock,
      contentReady, missingPrice, missingImages, negativeStock: 0,
    };
  } catch (error) {
    console.warn(
      `[WARN] Cannot load expected counts from ${expectedPath} (${(error as Error).message}); using built-in fallback.`
    );
    return { ...FALLBACK_EXPECTED };
  }
}

/** Phân trang range để vượt giới hạn ~1000 rows/query của Supabase. */
async function selectColumnPaged(
  table: "products" | "product_images",
  columns: string,
  pageSize = 1000
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 0;
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const query =
      table === "products"
        ? client.from("products").select(columns).range(from, to)
        : client.from("product_images").select(columns).range(from, to);
    const { data, error } = await query;
    if (error) throw new Error(`Paged select on ${table} failed: ${error.message}`);
    const batch = (data ?? []) as unknown as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }
  return rows;
}

export interface VerificationReport {
  totalProducts: number;
  usableProducts: number;
  partialProducts: number;
  identityOnlyProducts: number;
  inStockProducts: number;
  outOfStockProducts: number;
  contentReadyProducts: number;
  missingPriceProducts: number;
  productsWithoutImages: number;
  duplicateCanonicalUrls: number;
  negativeStockProducts: number;
  totalImages: number;
  totalVariants: number;
  totalCategories: number;
  totalPromotions: number;
  duplicateSkuRetained: boolean;
  expiredPromotionsExcludedFromActive: boolean;
  passed: boolean;
  failures: string[];
}

export async function runVerification(expected?: ExpectedCounts): Promise<VerificationReport> {
  const counts = expected ?? loadExpectedCounts();
  const failures: string[] = [];

  console.log("=== ONEVOICE CATALOG VERIFICATION ===");
  console.log(`[INFO] Expected counts source: ${counts.source}`);

  // 1. Total Products
  const { count: totalProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true });

  if (totalProducts !== counts.total) {
    failures.push(`Expected total products to be ${counts.total}, got ${totalProducts}`);
  }

  // 2. Qualities
  const { count: usableProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "usable");

  if (usableProducts !== counts.usable) {
    failures.push(`Expected usable products to be ${counts.usable}, got ${usableProducts}`);
  }

  const { count: partialProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "partial");

  if (partialProducts !== counts.partial) {
    failures.push(`Expected partial products to be ${counts.partial}, got ${partialProducts}`);
  }

  const { count: identityOnlyProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "identity_only");

  if (identityOnlyProducts !== counts.identityOnly) {
    failures.push(`Expected identity_only products to be ${counts.identityOnly}, got ${identityOnlyProducts}`);
  }

  // 3. Stock Status
  const { count: inStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("in_stock", true);

  if (inStockProducts !== counts.inStock) {
    failures.push(`Expected InStock products to be ${counts.inStock}, got ${inStockProducts}`);
  }

  const { count: outOfStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("in_stock", false);

  if (outOfStockProducts !== counts.outOfStock) {
    failures.push(`Expected OutOfStock products to be ${counts.outOfStock}, got ${outOfStockProducts}`);
  }

  // 4. Content Ready View
  const { count: contentReadyProducts } = await client
    .from("content_ready_products")
    .select("*", { count: "exact", head: true });

  if (contentReadyProducts !== counts.contentReady) {
    failures.push(`Expected content_ready_products view to have ${counts.contentReady} items, got ${contentReadyProducts}`);
  }

  // 5. Missing price check (price_vnd is null or <= 0)
  const { count: missingPriceProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .or("price_vnd.is.null,price_vnd.lte.0");

  if (missingPriceProducts !== counts.missingPrice) {
    failures.push(`Expected ${counts.missingPrice} products with missing price, got ${missingPriceProducts}`);
  }

  // 6. Negative stock check
  const { count: negativeStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .lt("stock_quantity", 0);

  if (negativeStockProducts !== counts.negativeStock) {
    failures.push(`Expected ${counts.negativeStock} products with negative stock, got ${negativeStockProducts}`);
  }

  // 7. Relational Counts
  const { count: totalImages } = await client
    .from("product_images")
    .select("*", { count: "exact", head: true });

  const { count: totalVariants } = await client
    .from("product_variants")
    .select("*", { count: "exact", head: true });

  const { count: totalCategories } = await client
    .from("categories")
    .select("*", { count: "exact", head: true });

  const { count: totalPromotions } = await client
    .from("promotions")
    .select("*", { count: "exact", head: true });

  // 8. Products without images: total - count(distinct product_id trên product_images).
  // Phân trang toàn bộ product_id rồi distinct trong JS (tương đương count(distinct ...)).
  const imageProductRows = await selectColumnPaged("product_images", "product_id");
  const distinctImageProducts = new Set<string>();
  for (const row of imageProductRows) {
    if (typeof row.product_id === "string") distinctImageProducts.add(row.product_id);
  }

  const productsWithoutImages = (totalProducts ?? 0) - distinctImageProducts.size;
  if (productsWithoutImages !== counts.missingImages) {
    failures.push(`Expected ${counts.missingImages} products without images, got ${productsWithoutImages}`);
  }

  // 8b. Duplicate canonical_url thật: phân trang canonical_url, đếm rows dư (total - distinct).
  const canonicalRows = await selectColumnPaged("products", "canonical_url");
  const distinctCanonicals = new Set<string>();
  for (const row of canonicalRows) {
    if (typeof row.canonical_url === "string") distinctCanonicals.add(row.canonical_url);
  }
  const duplicateCanonicalUrls = canonicalRows.length - distinctCanonicals.size;
  if (duplicateCanonicalUrls !== 0) {
    failures.push(`Expected 0 duplicate canonical_url rows, got ${duplicateCanonicalUrls}`);
  }

  // 9. Duplicate SKU check (ensure duplicate SKU group KB-LEOPOLD-FC750RBT-BLUEGREY-BROWN has 2 rows)
  const { data: dupSkuRows } = await client
    .from("products")
    .select("id,sku")
    .eq("sku", "KB-LEOPOLD-FC750RBT-BLUEGREY-BROWN");

  const duplicateSkuRetained = (dupSkuRows?.length ?? 0) === 2;
  if (!duplicateSkuRetained) {
    failures.push(`Expected duplicate SKU group to have 2 rows, found ${dupSkuRows?.length ?? 0}`);
  }

  // 10. Expired Promotions check in active view
  // Promo GEARVN-DEAL-DOCLAP expired 2026-09-02
  const { data: expiredInActiveView } = await client
    .from("active_product_promotions")
    .select("source_code")
    .eq("source_code", "GEARVN-DEAL-DOCLAP");

  const expiredPromotionsExcludedFromActive = (expiredInActiveView?.length ?? 0) === 0;
  if (!expiredPromotionsExcludedFromActive) {
    failures.push(`Expired promotion GEARVN-DEAL-DOCLAP should not appear in active_product_promotions view`);
  }

  const report: VerificationReport = {
    totalProducts: totalProducts ?? 0,
    usableProducts: usableProducts ?? 0,
    partialProducts: partialProducts ?? 0,
    identityOnlyProducts: identityOnlyProducts ?? 0,
    inStockProducts: inStockProducts ?? 0,
    outOfStockProducts: outOfStockProducts ?? 0,
    contentReadyProducts: contentReadyProducts ?? 0,
    missingPriceProducts: missingPriceProducts ?? 0,
    productsWithoutImages,
    duplicateCanonicalUrls,
    negativeStockProducts: negativeStockProducts ?? 0,
    totalImages: totalImages ?? 0,
    totalVariants: totalVariants ?? 0,
    totalCategories: totalCategories ?? 0,
    totalPromotions: totalPromotions ?? 0,
    duplicateSkuRetained,
    expiredPromotionsExcludedFromActive,
    passed: failures.length === 0,
    failures,
  };

  console.log(`- Total Products: ${report.totalProducts} (Expected: ${counts.total})`);
  console.log(`  * Usable: ${report.usableProducts} (Expected: ${counts.usable})`);
  console.log(`  * Partial: ${report.partialProducts} (Expected: ${counts.partial})`);
  console.log(`  * Identity Only: ${report.identityOnlyProducts} (Expected: ${counts.identityOnly})`);
  console.log(`- InStock: ${report.inStockProducts} (Expected: ${counts.inStock})`);
  console.log(`- OutOfStock: ${report.outOfStockProducts} (Expected: ${counts.outOfStock})`);
  console.log(`- Content-Ready Products: ${report.contentReadyProducts} (Expected: ${counts.contentReady})`);
  console.log(`- Missing Price: ${report.missingPriceProducts} (Expected: ${counts.missingPrice})`);
  console.log(`- Products Without Images: ${report.productsWithoutImages} (Expected: ${counts.missingImages})`);
  console.log(`- Duplicate Canonical URLs: ${report.duplicateCanonicalUrls} (Expected: 0)`);
  console.log(`- Negative Stock Count: ${report.negativeStockProducts} (Expected: ${counts.negativeStock})`);
  console.log(`- Total Images: ${report.totalImages}`);
  console.log(`- Total Variants: ${report.totalVariants}`);
  console.log(`- Total Categories: ${report.totalCategories}`);
  console.log(`- Total Promotions: ${report.totalPromotions}`);
  console.log(`- Duplicate SKU Retained: ${report.duplicateSkuRetained ? "YES" : "NO"}`);
  console.log(`- Expired Promotions Excluded from Active View: ${report.expiredPromotionsExcludedFromActive ? "YES" : "NO"}`);

  if (report.passed) {
    console.log("\n>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<\n");
  } else {
    console.error("\n>>> VERIFICATION CHECKS FAILED! <<<");
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flagValue = parseExpectedFlag(process.argv.slice(2));
  if (flagValue !== null && (flagValue.trim() === "" || flagValue.startsWith("--"))) {
    console.error("Usage: data:verify [--expected <path-to-dataset-summary.json>]");
    process.exit(1);
  }
  const expected = loadExpectedCounts(
    flagValue ? path.resolve(process.cwd(), flagValue) : DEFAULT_EXPECTED_PATH
  );
  runVerification(expected)
    .then((report) => {
      process.exit(report.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`Verification crashed: ${(err as Error).message}`);
      process.exit(1);
    });
}
