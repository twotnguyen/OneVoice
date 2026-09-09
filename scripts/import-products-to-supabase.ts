// SPDX-License-Identifier: Apache-2.0

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "../src/lib/supabase/database.types.ts";

const RawOfferSchema = z
  .object({
    price: z.number().nullable().optional(),
    priceCurrency: z.string().nullable().optional(),
    availability: z.string().nullable().optional(),
    compareAtPrice: z.number().nullable().optional(),
  })
  .passthrough();

const RawVariantSchema = z
  .object({
    id: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
    compareAtPrice: z.number().nullable().optional(),
    inStock: z.boolean().nullable().optional(),
    stockQuantity: z.number().nullable().optional(),
    options: z.record(z.string(), z.unknown()).nullable().optional(),
    imageUrl: z.string().nullable().optional(),
  })
  .passthrough();

const RawPromotionSchema = z
  .object({
    code: z.string().nullable().optional(),
    label: z.string(),
    type: z.string().nullable().optional(),
    discountType: z.string().nullable().optional(),
    discountValue: z.number().nullable().optional(),
    startDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    isFlashSale: z.boolean().nullable().optional(),
  })
  .passthrough();

const RawCollectionSchema = z
  .object({
    id: z.string().nullable().optional(),
    name: z.string(),
    slug: z.string().nullable().optional(),
  })
  .passthrough();

const RawBreadcrumbSchema = z
  .object({
    name: z.string(),
    url: z.string().nullable().optional(),
  })
  .passthrough();

export const RawProductSchema = z
  .object({
    sourceUrl: z.string().min(1),
    canonicalUrl: z.string().min(1),
    productSlug: z.string().nullable().optional(),
    name: z.string().min(1),
    sku: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    breadcrumbs: z.array(RawBreadcrumbSchema).nullable().optional(),
    categoryUrls: z.array(z.string()).nullable().optional(),
    description: z.string().nullable().optional(),
    descriptionText: z.string().nullable().optional(),
    descriptionHtml: z.string().nullable().optional(),
    imageUrls: z.array(z.string()).default([]),
    offer: RawOfferSchema.nullable().optional(),
    internalProductId: z.string().nullable().optional(),
    stockTotal: z.number().nullable().optional(),
    primaryCollection: RawCollectionSchema.nullable().optional(),
    variants: z.array(RawVariantSchema).default([]),
    promotions: z.array(RawPromotionSchema).default([]),
    specifications: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    productType: z.string().nullable().optional(),
    completeness: z
      .object({
        score: z.number().optional(),
        missing: z.array(z.string()).optional(),
      })
      .nullable()
      .optional(),
    collectedAt: z.string().nullable().optional(),
    extractorVersion: z.string().nullable().optional(),
    httpStatus: z.number().nullable().optional(),
    priceVnd: z.number().nullable().optional(),
    specificationCount: z.number().default(0),
    normalizedAttributes: z.record(z.string(), z.unknown()).nullable().optional(),
    quality: z.enum(["usable", "partial", "identity_only"]),
  })
  .passthrough();

export type RawProduct = z.infer<typeof RawProductSchema>;

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const BATCH_SIZE = 150;

function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }
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

export function getSupabaseClient(): SupabaseClient<Database> {
  const fileEnv = loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  description: string,
  maxRetries = 4,
  baseDelayMs = 400
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt > maxRetries) {
        throw new Error(`[${description}] failed after ${attempt} attempts: ${(err as Error).message}`);
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[RETRY ${attempt}/${maxRetries}] ${description} in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export interface ImportOptions {
  sourceFile: string;
  dryRun?: boolean;
  batchSize?: number;
  organizationId?: string;
}

export interface ImportSummary {
  sourceFile: string;
  sourceSha256: string;
  totalLines: number;
  validRecords: number;
  validationErrors: number;
  insertedCount: number;
  updatedCount: number;
  qualities: Record<string, number>;
  inStockCount: number;
  outOfStockCount: number;
  usableInStockCount: number;
  dryRun: boolean;
  durationMs: number;
}

export async function importProducts(options: ImportOptions): Promise<ImportSummary> {
  const {
    sourceFile,
    dryRun = false,
    batchSize = BATCH_SIZE,
    organizationId = DEFAULT_ORG_ID,
  } = options;

  const startTime = Date.now();
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Source file not found: ${sourceFile}`);
  }

  // 1. Calculate SHA256 Checksum
  console.log(`[INFO] Computing SHA-256 for: ${sourceFile}`);
  const hash = crypto.createHash("sha256");
  const fileStream = fs.createReadStream(sourceFile);
  for await (const chunk of fileStream) {
    hash.update(chunk);
  }
  const sourceSha256 = hash.digest("hex");
  console.log(`[INFO] Source SHA-256: ${sourceSha256}`);

  const client = dryRun ? null : getSupabaseClient();

  let importRunId: string | null = null;
  if (client) {
    // Record import run started
    const { data: run, error: runErr } = await client
      .from("product_import_runs")
      .insert({
        organization_id: organizationId,
        source_file: sourceFile,
        source_sha256: sourceSha256,
        status: "RUNNING",
      })
      .select("id")
      .single();

    if (runErr) {
      console.warn(`[WARN] Failed to insert product_import_run record: ${runErr.message}`);
    } else if (run) {
      importRunId = run.id;
      console.log(`[INFO] Started import run ID: ${importRunId}`);
    }
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(sourceFile, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let validCount = 0;
  let validationErrorCount = 0;
  const errorsSummary: Array<{ line: number; message: string }> = [];

  const qualities: Record<string, number> = { usable: 0, partial: 0, identity_only: 0 };
  let inStockCount = 0;
  let outOfStockCount = 0;
  let usableInStockCount = 0;

  let currentBatch: RawProduct[] = [];
  let batchIndex = 0;

  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch (jsonErr) {
      validationErrorCount++;
      errorsSummary.push({ line: lineNum, message: `Invalid JSON: ${(jsonErr as Error).message}` });
      continue;
    }

    const parseResult = RawProductSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      validationErrorCount++;
      const issue = parseResult.error.issues[0];
      errorsSummary.push({
        line: lineNum,
        message: `${issue?.path.join(".") ?? "root"}: ${issue?.message ?? "Invalid"}`,
      });
      continue;
    }

    const doc = parseResult.data;
    validCount++;

    qualities[doc.quality] = (qualities[doc.quality] || 0) + 1;
    const inStock = doc.offer?.availability === "https://schema.org/InStock";
    if (inStock) inStockCount++;
    else outOfStockCount++;

    if (doc.quality === "usable" && inStock) usableInStockCount++;

    currentBatch.push(doc);

    if (currentBatch.length >= batchSize) {
      batchIndex++;
      if (!dryRun && client) {
        await processBatch(client, organizationId, currentBatch, batchIndex);
      }
      console.log(
        `[BATCH ${batchIndex}] Processed ${validCount} items (Batch size: ${currentBatch.length})${
          dryRun ? " [DRY-RUN]" : ""
        }`
      );
      currentBatch = [];
    }
  }

  // Flush remaining records
  if (currentBatch.length > 0) {
    batchIndex++;
    if (!dryRun && client) {
      await processBatch(client, organizationId, currentBatch, batchIndex);
    }
    console.log(
      `[BATCH ${batchIndex}] Processed ${validCount} items (Batch size: ${currentBatch.length})${
        dryRun ? " [DRY-RUN]" : ""
      }`
    );
    currentBatch = [];
  }

  const durationMs = Date.now() - startTime;

  if (client && importRunId) {
    await client
      .from("product_import_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: validationErrorCount === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS",
        total_rows: lineNum,
        inserted_rows: validCount,
        failed_rows: validationErrorCount,
        error_summary: errorsSummary.slice(0, 50),
      })
      .eq("id", importRunId);
  }

  const summary: ImportSummary = {
    sourceFile,
    sourceSha256,
    totalLines: lineNum,
    validRecords: validCount,
    validationErrors: validationErrorCount,
    insertedCount: validCount,
    updatedCount: 0,
    qualities,
    inStockCount,
    outOfStockCount,
    usableInStockCount,
    dryRun,
    durationMs,
  };

  console.log("\n==========================================");
  console.log(`[SUMMARY] Import completed in ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`- Mode: ${dryRun ? "DRY-RUN (No database writes)" : "REAL IMPORT"}`);
  console.log(`- Total lines read: ${lineNum}`);
  console.log(`- Valid records: ${validCount}`);
  console.log(`- Validation errors: ${validationErrorCount}`);
  console.log(`- Qualities:`, qualities);
  console.log(`- InStock: ${inStockCount} | OutOfStock: ${outOfStockCount}`);
  console.log(`- usable + InStock: ${usableInStockCount}`);
  console.log("==========================================\n");

  return summary;
}

async function processBatch(
  client: SupabaseClient<Database>,
  organizationId: string,
  batch: RawProduct[],
  batchIndex: number
): Promise<void> {
  // A. Collect and Upsert Categories
  const categoryMap = new Map<string, { name: string; slug: string | null; source_category_id: string | null }>();
  for (const doc of batch) {
    if (doc.primaryCollection && doc.primaryCollection.name) {
      const name = doc.primaryCollection.name.trim();
      if (name && !categoryMap.has(name)) {
        categoryMap.set(name, {
          name,
          slug: doc.primaryCollection.slug ?? null,
          source_category_id: doc.primaryCollection.id ?? null,
        });
      }
    } else if (doc.category && doc.category.trim()) {
      const name = doc.category.trim();
      if (!categoryMap.has(name)) {
        categoryMap.set(name, {
          name,
          slug: null,
          source_category_id: null,
        });
      }
    }
  }

  const catRows = Array.from(categoryMap.values()).map((c) => ({
    organization_id: organizationId,
    name: c.name,
    slug: c.slug,
    source_category_id: c.source_category_id,
  }));

  const categoryIdByName = new Map<string, string>();
  if (catRows.length > 0) {
    await withRetry(
      async () => {
        const { data, error } = await client
          .from("categories")
          .upsert(catRows, { onConflict: "organization_id,name" })
          .select("id,name");
        if (error) throw new Error(error.message);
        if (data) {
          for (const row of data) {
            categoryIdByName.set(row.name, row.id);
          }
        }
      },
      `Upsert categories for batch ${batchIndex}`
    );
  }

  // B. Collect and Upsert Promotions
  const promoMap = new Map<
    string,
    {
      source_code: string;
      label: string;
      promotion_type: string | null;
      discount_type: string | null;
      discount_value: number | null;
      starts_at: string | null;
      expires_at: string | null;
      is_flash_sale: boolean;
      source_payload: unknown;
    }
  >();

  for (const doc of batch) {
    if (doc.promotions) {
      for (const p of doc.promotions) {
        const code = p.code || "NO_CODE";
        const label = p.label.trim();
        const key = `${code}:::${label}`;
        if (!promoMap.has(key)) {
          promoMap.set(key, {
            source_code: code,
            label,
            promotion_type: p.type ?? null,
            discount_type: p.discountType ?? null,
            discount_value: p.discountValue ?? null,
            starts_at: p.startDate ?? null,
            expires_at: p.expiryDate ?? null,
            is_flash_sale: Boolean(p.isFlashSale),
            source_payload: p,
          });
        }
      }
    }
  }

  const promoRows = Array.from(promoMap.values()).map((p) => ({
    organization_id: organizationId,
    source_code: p.source_code,
    label: p.label,
    promotion_type: p.promotion_type,
    discount_type: p.discount_type,
    discount_value: p.discount_value,
    starts_at: p.starts_at,
    expires_at: p.expires_at,
    is_flash_sale: p.is_flash_sale,
    source_payload: p.source_payload as Database["public"]["Tables"]["promotions"]["Insert"]["source_payload"],
  }));

  const promoIdByKey = new Map<string, string>();
  if (promoRows.length > 0) {
    await withRetry(
      async () => {
        const { data, error } = await client
          .from("promotions")
          .upsert(promoRows, { onConflict: "organization_id,source_code,label" })
          .select("id,source_code,label");
        if (error) throw new Error(error.message);
        if (data) {
          for (const row of data) {
            promoIdByKey.set(`${row.source_code || "NO_CODE"}:::${row.label}`, row.id);
          }
        }
      },
      `Upsert promotions for batch ${batchIndex}`
    );
  }

  // C. Prepare Products
  const productRows = batch.map((doc) => {
    const inStock = doc.offer?.availability === "https://schema.org/InStock";
    let stockQuantity: number | null = null;
    if (doc.stockTotal != null && doc.stockTotal >= 0) {
      stockQuantity = Math.round(doc.stockTotal);
    }

    return {
      organization_id: organizationId,
      source_name: "GearVN",
      source_url: doc.sourceUrl,
      canonical_url: doc.canonicalUrl,
      source_product_id: doc.internalProductId ?? null,
      slug: doc.productSlug ?? null,
      sku: doc.sku ?? null,
      name: doc.name,
      brand: doc.brand ?? null,
      product_type: doc.productType ?? null,
      category_name: doc.primaryCollection?.name ?? doc.category ?? null,
      description: doc.description ?? null,
      description_text: doc.descriptionText ?? null,
      price_vnd: doc.priceVnd != null ? Math.round(doc.priceVnd) : null,
      compare_at_price_vnd:
        doc.offer?.compareAtPrice != null ? Math.round(doc.offer.compareAtPrice) : null,
      currency: doc.offer?.priceCurrency ?? "VND",
      availability: doc.offer?.availability ?? null,
      in_stock: inStock,
      stock_quantity: stockQuantity,
      quality: doc.quality,
      completeness_score: doc.completeness?.score ?? null,
      specification_count: doc.specificationCount ?? (doc.specifications?.length ?? 0),
      collected_at: doc.collectedAt ?? null,
      extractor_version: doc.extractorVersion ?? null,
      source_http_status: doc.httpStatus ?? null,
      normalized_attributes: (doc.normalizedAttributes ?? null) as Database["public"]["Tables"]["products"]["Insert"]["normalized_attributes"],
      specifications: (doc.specifications ?? null) as Database["public"]["Tables"]["products"]["Insert"]["specifications"],
      breadcrumbs: (doc.breadcrumbs ?? null) as Database["public"]["Tables"]["products"]["Insert"]["breadcrumbs"],
      source_payload: doc as Database["public"]["Tables"]["products"]["Insert"]["source_payload"],
    };
  });

  const productIdByCanonical = new Map<string, string>();
  await withRetry(
    async () => {
      const { data, error } = await client
        .from("products")
        .upsert(productRows, { onConflict: "organization_id,canonical_url" })
        .select("id,canonical_url");
      if (error) throw new Error(error.message);
      if (data) {
        for (const row of data) {
          productIdByCanonical.set(row.canonical_url, row.id);
        }
      }
    },
    `Upsert products for batch ${batchIndex}`
  );

  // D. Prepare Images, Variants, Product Categories, Product Promotions
  const imageRows: Array<Database["public"]["Tables"]["product_images"]["Insert"]> = [];
  const variantRows: Array<Database["public"]["Tables"]["product_variants"]["Insert"]> = [];
  const prodCatRows: Array<Database["public"]["Tables"]["product_categories"]["Insert"]> = [];
  const prodPromoRows: Array<Database["public"]["Tables"]["product_promotions"]["Insert"]> = [];

  for (const doc of batch) {
    const productId = productIdByCanonical.get(doc.canonicalUrl);
    if (!productId) continue;

    // Images
    if (doc.imageUrls && doc.imageUrls.length > 0) {
      doc.imageUrls.forEach((url, idx) => {
        imageRows.push({
          product_id: productId,
          source_url: url,
          position: idx,
          is_primary: idx === 0,
        });
      });
    }

    // Variants
    if (doc.variants && doc.variants.length > 0) {
      doc.variants.forEach((v, vIdx) => {
        variantRows.push({
          product_id: productId,
          source_variant_id: v.id ?? `var-${vIdx}`,
          sku: v.sku ?? null,
          name: v.name ?? doc.name,
          price_vnd: v.price != null ? Math.round(v.price) : null,
          compare_at_price_vnd: v.compareAtPrice != null ? Math.round(v.compareAtPrice) : null,
          in_stock: v.inStock ?? (doc.offer?.availability === "https://schema.org/InStock"),
          stock_quantity: v.stockQuantity != null && v.stockQuantity >= 0 ? Math.round(v.stockQuantity) : null,
          options: (v.options ?? null) as Database["public"]["Tables"]["product_variants"]["Insert"]["options"],
          image_url: v.imageUrl ?? null,
        });
      });
    }

    // Category Relation
    const catName = (doc.primaryCollection?.name ?? doc.category ?? "").trim();
    if (catName) {
      const catId = categoryIdByName.get(catName);
      if (catId) {
        prodCatRows.push({
          product_id: productId,
          category_id: catId,
          is_primary: true,
          assignment_method: doc.primaryCollection ? "primaryCollection" : "category",
          metadata: { source: "jsonl" },
        });
      }
    }

    // Promotion Relations
    if (doc.promotions) {
      for (const p of doc.promotions) {
        const key = `${p.code || "NO_CODE"}:::${p.label.trim()}`;
        const promoId = promoIdByKey.get(key);
        if (promoId) {
          prodPromoRows.push({
            product_id: productId,
            promotion_id: promoId,
          });
        }
      }
    }
  }

  // Bulk upsert relational rows
  if (imageRows.length > 0) {
    await withRetry(
      async () => {
        const { error } = await client
          .from("product_images")
          .upsert(imageRows, { onConflict: "product_id,source_url" });
        if (error) throw new Error(error.message);
      },
      `Upsert ${imageRows.length} images for batch ${batchIndex}`
    );
  }

  if (variantRows.length > 0) {
    await withRetry(
      async () => {
        const { error } = await client
          .from("product_variants")
          .upsert(variantRows, { onConflict: "product_id,source_variant_id" });
        if (error) throw new Error(error.message);
      },
      `Upsert ${variantRows.length} variants for batch ${batchIndex}`
    );
  }

  if (prodCatRows.length > 0) {
    await withRetry(
      async () => {
        const { error } = await client
          .from("product_categories")
          .upsert(prodCatRows, { onConflict: "product_id,category_id" });
        if (error) throw new Error(error.message);
      },
      `Upsert ${prodCatRows.length} product-categories for batch ${batchIndex}`
    );
  }

  if (prodPromoRows.length > 0) {
    await withRetry(
      async () => {
        const { error } = await client
          .from("product_promotions")
          .upsert(prodPromoRows, { onConflict: "product_id,promotion_id" });
        if (error) throw new Error(error.message);
      },
      `Upsert ${prodPromoRows.length} product-promotions for batch ${batchIndex}`
    );
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sourceFile = path.resolve(
    process.cwd(),
    "data/normalized/products-2026-08-31T05-34-42-944Z.jsonl"
  );

  console.log(`Starting OneVoice Product Catalog Importer...`);
  console.log(`- Target File: ${sourceFile}`);
  console.log(`- Mode: ${dryRun ? "DRY-RUN" : "PRODUCTION IMPORT"}`);

  importProducts({ sourceFile, dryRun })
    .then((summary) => {
      if (summary.validationErrors > 0 || summary.validRecords !== 4109) {
        console.error(
          `[FAIL] Importer did not match validation criteria! Valid: ${summary.validRecords}/4109, Errors: ${summary.validationErrors}`
        );
        process.exit(1);
      }
      console.log(`[SUCCESS] Importer finished successfully.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[FATAL] Importer failed: ${err.message}`);
      process.exit(1);
    });
}
