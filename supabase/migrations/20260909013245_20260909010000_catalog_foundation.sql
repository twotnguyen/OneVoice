-- SPDX-License-Identifier: Apache-2.0

-- =========================================================================
-- Migration: 20260909013245_20260909010000_catalog_foundation.sql
-- Purpose: Schema foundation for OneVoice Computer Catalog, multi-tenant organizations,
--          products, images, variants, promotions, categories, and AI context views.
-- =========================================================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default OneVoice Demo Organization
INSERT INTO public.organizations (id, name, slug)
VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'OneVoice Computer Demo',
  'onevoice-computer-demo'
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = now();

-- 2. Products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_name TEXT DEFAULT 'GearVN',
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  source_product_id TEXT,
  slug TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  product_type TEXT,
  category_name TEXT,
  description TEXT,
  description_text TEXT,
  price_vnd BIGINT,
  compare_at_price_vnd BIGINT,
  currency TEXT NOT NULL DEFAULT 'VND',
  availability TEXT,
  in_stock BOOLEAN NOT NULL,
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  quality TEXT NOT NULL,
  completeness_score NUMERIC,
  specification_count INTEGER NOT NULL DEFAULT 0,
  collected_at TIMESTAMPTZ,
  extractor_version TEXT,
  source_http_status INTEGER,
  normalized_attributes JSONB,
  specifications JSONB,
  breadcrumbs JSONB,
  source_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_org_canonical UNIQUE (organization_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON public.products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_quality ON public.products(quality);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON public.products(in_stock);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON public.products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_price_vnd ON public.products(price_vnd);
CREATE INDEX IF NOT EXISTS idx_products_collected_at ON public.products(collected_at);

-- 3. Product Images
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  storage_path TEXT,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_images_product_url UNIQUE (product_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_is_primary ON public.product_images(product_id, is_primary);

-- 4. Product Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_variant_id TEXT,
  sku TEXT,
  name TEXT,
  price_vnd BIGINT,
  compare_at_price_vnd BIGINT,
  in_stock BOOLEAN,
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  options JSONB,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_variants_product_source_id UNIQUE (product_id, source_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);

-- 5. Promotions
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_code TEXT,
  label TEXT NOT NULL,
  promotion_type TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_flash_sale BOOLEAN NOT NULL DEFAULT false,
  source_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_promotions_org_code_label UNIQUE (organization_id, source_code, label)
);

CREATE INDEX IF NOT EXISTS idx_promotions_org_id ON public.promotions(organization_id);
CREATE INDEX IF NOT EXISTS idx_promotions_expiry ON public.promotions(expires_at);

-- 6. Product Promotions
CREATE TABLE IF NOT EXISTS public.product_promotions (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, promotion_id)
);

CREATE INDEX IF NOT EXISTS idx_product_promotions_product ON public.product_promotions(product_id);
CREATE INDEX IF NOT EXISTS idx_product_promotions_promotion ON public.product_promotions(promotion_id);

-- 7. Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_category_id TEXT,
  name TEXT NOT NULL,
  slug TEXT,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_org_name UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_org_id ON public.categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);

-- 8. Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  assignment_method TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product ON public.product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON public.product_categories(category_id);

-- 9. Product Import Runs
CREATE TABLE IF NOT EXISTS public.product_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_file TEXT,
  source_sha256 TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  error_summary JSONB
);

-- 10. Views
-- 10.1 content_ready_products
CREATE OR REPLACE VIEW public.content_ready_products AS
SELECT p.*
FROM public.products p
WHERE p.quality = 'usable'
  AND p.in_stock = true
  AND p.price_vnd > 0
  AND p.name IS NOT NULL AND trim(p.name) <> ''
  AND EXISTS (
    SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id
  );

-- 10.2 active_product_promotions
CREATE OR REPLACE VIEW public.active_product_promotions AS
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

-- 10.3 product_content_context
CREATE OR REPLACE VIEW public.product_content_context AS
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

-- 11. Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_import_runs ENABLE ROW LEVEL SECURITY;

-- Allow read access for public / anon / authenticated
CREATE POLICY "Allow public read organizations" ON public.organizations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read products" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read product_images" ON public.product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read product_variants" ON public.product_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read promotions" ON public.promotions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read product_promotions" ON public.product_promotions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read product_categories" ON public.product_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated read import_runs" ON public.product_import_runs FOR SELECT TO authenticated USING (true);

-- Allow service_role full management
CREATE POLICY "Service role manages organizations" ON public.organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages products" ON public.products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages product_images" ON public.product_images FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages product_variants" ON public.product_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages promotions" ON public.promotions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages product_promotions" ON public.product_promotions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages categories" ON public.categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages product_categories" ON public.product_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages import_runs" ON public.product_import_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
