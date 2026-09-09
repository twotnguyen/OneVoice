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

export async function runVerification(): Promise<VerificationReport> {
  const failures: string[] = [];

  console.log("=== ONEVOICE CATALOG VERIFICATION ===");

  // 1. Total Products
  const { count: totalProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true });

  if (totalProducts !== 4109) {
    failures.push(`Expected total products to be 4109, got ${totalProducts}`);
  }

  // 2. Qualities
  const { count: usableProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "usable");

  if (usableProducts !== 3977) {
    failures.push(`Expected usable products to be 3977, got ${usableProducts}`);
  }

  const { count: partialProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "partial");

  if (partialProducts !== 82) {
    failures.push(`Expected partial products to be 82, got ${partialProducts}`);
  }

  const { count: identityOnlyProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("quality", "identity_only");

  if (identityOnlyProducts !== 50) {
    failures.push(`Expected identity_only products to be 50, got ${identityOnlyProducts}`);
  }

  // 3. Stock Status
  const { count: inStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("in_stock", true);

  if (inStockProducts !== 1506) {
    failures.push(`Expected InStock products to be 1506, got ${inStockProducts}`);
  }

  const { count: outOfStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("in_stock", false);

  if (outOfStockProducts !== 2603) {
    failures.push(`Expected OutOfStock products to be 2603, got ${outOfStockProducts}`);
  }

  // 4. Content Ready View
  const { count: contentReadyProducts } = await client
    .from("content_ready_products")
    .select("*", { count: "exact", head: true });

  if (contentReadyProducts !== 1455) {
    failures.push(`Expected content_ready_products view to have 1455 items, got ${contentReadyProducts}`);
  }

  // 5. Missing price check (price_vnd is null or <= 0)
  const { count: missingPriceProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .or("price_vnd.is.null,price_vnd.lte.0");

  if (missingPriceProducts !== 0) {
    failures.push(`Expected 0 products with missing price, got ${missingPriceProducts}`);
  }

  // 6. Negative stock check
  const { count: negativeStockProducts } = await client
    .from("products")
    .select("*", { count: "exact", head: true })
    .lt("stock_quantity", 0);

  if (negativeStockProducts !== 0) {
    failures.push(`Expected 0 products with negative stock, got ${negativeStockProducts}`);
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

  // 8. Products without images (check via left join / count check)
  const { count: imagesCountByDistinctProduct } = await client
    .from("product_images")
    .select("product_id", { count: "exact", head: true })
    .eq("is_primary", true);

  const productsWithoutImages = (totalProducts ?? 0) - (imagesCountByDistinctProduct ?? 0);
  if (productsWithoutImages !== 0) {
    failures.push(`Expected 0 products without images, got ${productsWithoutImages}`);
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
    duplicateCanonicalUrls: 0,
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

  console.log(`- Total Products: ${report.totalProducts} (Expected: 4109)`);
  console.log(`  * Usable: ${report.usableProducts} (Expected: 3977)`);
  console.log(`  * Partial: ${report.partialProducts} (Expected: 82)`);
  console.log(`  * Identity Only: ${report.identityOnlyProducts} (Expected: 50)`);
  console.log(`- InStock: ${report.inStockProducts} (Expected: 1506)`);
  console.log(`- OutOfStock: ${report.outOfStockProducts} (Expected: 2603)`);
  console.log(`- Content-Ready Products: ${report.contentReadyProducts} (Expected: 1455)`);
  console.log(`- Missing Price: ${report.missingPriceProducts} (Expected: 0)`);
  console.log(`- Products Without Images: ${report.productsWithoutImages} (Expected: 0)`);
  console.log(`- Negative Stock Count: ${report.negativeStockProducts} (Expected: 0)`);
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
  runVerification()
    .then((report) => {
      process.exit(report.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`Verification crashed: ${err.message}`);
      process.exit(1);
    });
}
