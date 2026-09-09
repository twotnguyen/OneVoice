-- SPDX-License-Identifier: Apache-2.0

-- =========================================================================
-- Migration: 20260909015327_20260909020000_catalog_security_integrity.sql
-- Purpose: Remediate RLS vulnerabilities, revoke direct public/anon access,
--          recreate views with security_invoker = true and explicit column lists,
--          prevent exposure of source_payload and description_html.
-- =========================================================================

-- 1. Drop insecure public-read policies
DROP POLICY IF EXISTS "Allow public read organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow public read products" ON public.products;
DROP POLICY IF EXISTS "Allow public read product_images" ON public.product_images;
DROP POLICY IF EXISTS "Allow public read product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "Allow public read promotions" ON public.promotions;
DROP POLICY IF EXISTS "Allow public read product_promotions" ON public.product_promotions;
DROP POLICY IF EXISTS "Allow public read categories" ON public.categories;
DROP POLICY IF EXISTS "Allow public read product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Allow authenticated read import_runs" ON public.product_import_runs;

-- 2. Revoke table-level permissions from anon and authenticated roles
REVOKE ALL ON TABLE public.organizations FROM anon, authenticated;
REVOKE ALL ON TABLE public.products FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_images FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_variants FROM anon, authenticated;
REVOKE ALL ON TABLE public.promotions FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_promotions FROM anon, authenticated;
REVOKE ALL ON TABLE public.categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_import_runs FROM anon, authenticated;

-- 3. Drop existing views so column lists can be updated safely
DROP VIEW IF EXISTS public.content_ready_products CASCADE;
DROP VIEW IF EXISTS public.active_product_promotions CASCADE;
DROP VIEW IF EXISTS public.product_content_context CASCADE;

-- 4. Recreate views with explicit column lists and security_invoker = true
-- 4.1 content_ready_products: explicitly omit source_payload and description_html
CREATE VIEW public.content_ready_products
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.organization_id,
  p.source_name,
  p.source_url,
  p.canonical_url,
  p.source_product_id,
  p.slug,
  p.sku,
  p.name,
  p.brand,
  p.product_type,
  p.category_name,
  p.description,
  p.description_text,
  p.price_vnd,
  p.compare_at_price_vnd,
  p.currency,
  p.availability,
  p.in_stock,
  p.stock_quantity,
  p.quality,
  p.completeness_score,
  p.specification_count,
  p.collected_at,
  p.extractor_version,
  p.source_http_status,
  p.normalized_attributes,
  p.specifications,
  p.breadcrumbs,
  p.created_at,
  p.updated_at
FROM public.products p
WHERE p.quality = 'usable'
  AND p.in_stock = true
  AND p.price_vnd > 0
  AND p.name IS NOT NULL AND trim(p.name) <> ''
  AND EXISTS (
    SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id
  );

-- 4.2 active_product_promotions: explicit column list
CREATE VIEW public.active_product_promotions
WITH (security_invoker = true) AS
SELECT
  pp.product_id,
  pr.id AS promotion_id,
  pr.organization_id,
  pr.source_code,
  pr.label,
  pr.promotion_type,
  pr.discount_type,
  pr.discount_value,
  pr.starts_at,
  pr.expires_at,
  pr.is_flash_sale
FROM public.product_promotions pp
JOIN public.promotions pr ON pp.promotion_id = pr.id
WHERE (pr.starts_at IS NULL OR pr.starts_at <= now())
  AND (pr.expires_at IS NULL OR pr.expires_at >= now());

-- 4.3 product_content_context: safe snapshot for AI
CREATE VIEW public.product_content_context
WITH (security_invoker = true) AS
SELECT
  p.id AS product_id,
  p.organization_id,
  p.name,
  p.sku,
  p.brand,
  p.product_type,
  p.price_vnd AS current_price,
  p.compare_at_price_vnd AS compare_at_price,
  p.in_stock,
  p.stock_quantity,
  (
    SELECT pi.source_url
    FROM public.product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_primary DESC, pi.position ASC, pi.created_at ASC
    LIMIT 1
  ) AS primary_image_url,
  p.normalized_attributes,
  p.specifications,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'code', ap.source_code,
          'label', ap.label,
          'discount_type', ap.discount_type,
          'discount_value', ap.discount_value,
          'expires_at', ap.expires_at,
          'is_flash_sale', ap.is_flash_sale
        )
      )
      FROM public.active_product_promotions ap
      WHERE ap.product_id = p.id
    ),
    '[]'::jsonb
  ) AS active_promotions,
  p.quality,
  p.completeness_score,
  p.collected_at,
  (p.collected_at < (now() - interval '7 days')) AS is_data_stale
FROM public.products p;

-- 5. Revoke view permissions from anon and authenticated
REVOKE ALL ON TABLE public.content_ready_products FROM anon, authenticated;
REVOKE ALL ON TABLE public.active_product_promotions FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_content_context FROM anon, authenticated;
