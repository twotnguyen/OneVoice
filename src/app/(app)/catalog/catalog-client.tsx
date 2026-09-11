// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { ProductDetail, StudioProduct } from "@/lib/catalog/types";

// ==============================================================================
// Constants & Metadata Configuration
// ==============================================================================

type CategoryTab = Readonly<{
  id: string;
  label: string;
  count: number;
}>;

const CATEGORY_TABS: readonly CategoryTab[] = [
  { id: "all", label: "🌟 Tất cả", count: 3977 },
  { id: "monitor", label: "🖥️ Màn hình", count: 308 },
  { id: "keyboard", label: "⌨️ Bàn phím", count: 527 },
  { id: "laptop", label: "💻 Laptop", count: 244 },
  { id: "mouse", label: "🖱️ Chuột", count: 247 },
  { id: "headset", label: "🎧 Tai nghe", count: 194 },
  { id: "furniture", label: "🪑 Bàn/Ghế", count: 104 },
  { id: "pc", label: "🖥️ PC bộ", count: 76 },
];

const BRANDS_BY_CATEGORY: Record<string, readonly string[]> = {
  all: ["ASUS", "MSI", "GIGABYTE", "ACER", "Razer", "Logitech", "AULA", "Corsair"],
  monitor: ["ASUS", "ViewSonic", "AOC", "LG", "MSI", "ACER", "Samsung", "E-Dra"],
  keyboard: ["AULA", "Logitech", "ASUS", "Leobog", "AKKO", "DareU", "Razer", "HyperWork"],
  laptop: ["ACER", "ASUS", "GIGABYTE", "DELL", "MSI", "LENOVO", "LG", "HP"],
  mouse: ["Logitech", "Razer", "ASUS", "AKKO", "HyperWork", "DareU"],
  headset: ["Razer", "HyperX", "Logitech", "AKKO", "DareU"],
  furniture: ["Razer", "Warrior", "E-Dra", "Corsair", "HyperWork", "Sihoo"],
  pc: ["GEARVN", "MSI", "ACER"],
};

type PriceRange = "all" | "under-15" | "15-25" | "25-35" | "above-35";

interface PriceRangeConfig {
  id: PriceRange;
  label: string;
  min?: number;
  max?: number;
}

const PRICE_RANGES: readonly PriceRangeConfig[] = [
  { id: "all", label: "Tất cả mức giá" },
  { id: "under-15", label: "< 15tr", max: 15_000_000 },
  { id: "15-25", label: "15-25tr", min: 15_000_000, max: 25_000_000 },
  { id: "25-35", label: "25-35tr", min: 25_000_000, max: 35_000_000 },
  { id: "above-35", label: "> 35tr", min: 35_000_000 },
];

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const SPEC_LABEL_TRANSLATIONS: Record<string, string> = {
  cpu: "Vi xử lý (CPU)",
  gpu: "Card đồ họa (GPU)",
  ram: "Bộ nhớ RAM",
  storage: "Ổ cứng",
  screen: "Màn hình",
  resolution: "Độ phân giải",
  refreshRate: "Tần số quét",
  panel: "Tấm nền",
  weight: "Trọng lượng",
  battery: "Pin",
  os: "Hệ điều hành",
  color: "Màu sắc",
  switch: "Loại Switch",
  layout: "Layout bàn phím",
  connection: "Chuẩn kết nối",
  keycaps: "Chất liệu Keycap",
  dpi: "Độ phân giải (DPI)",
  sensor: "Cảm biến quang học",
  lighting: "Đèn LED RGB",
  audio: "Công nghệ âm thanh",
  microphone: "Microphone",
  power: "Công suất nguồn",
  chipset: "Chipset",
  formFactor: "Kích thước / Chuẩn",
};

interface SpecRow {
  label: string;
  value: string;
}

function formatSpecificationRows(
  product: StudioProduct,
  detail: ProductDetail | null
): SpecRow[] {
  const rows: SpecRow[] = [];
  const seenLabels = new Set<string>();

  // 1. Basic product attributes
  if (product.brand) {
    rows.push({ label: "Thương hiệu", value: product.brand });
    seenLabels.add("thương hiệu");
  }
  if (product.sku) {
    rows.push({ label: "Mã SKU", value: product.sku });
    seenLabels.add("mã sku");
  }
  if (detail?.categoryName) {
    rows.push({ label: "Danh mục", value: detail.categoryName });
    seenLabels.add("danh mục");
  }

  // 2. Structured specifications array if present
  if (detail?.specifications && Array.isArray(detail.specifications)) {
    for (const item of detail.specifications) {
      if (typeof item === "object" && item !== null) {
        const spec = item as Record<string, unknown>;
        const name = String(spec.name ?? spec.label ?? spec.title ?? "").trim();
        const value = String(spec.value ?? spec.val ?? spec.text ?? "").trim();
        if (name && value && !seenLabels.has(name.toLowerCase())) {
          rows.push({ label: name, value });
          seenLabels.add(name.toLowerCase());
        }
      }
    }
  }

  // 3. Normalized attributes dictionary
  if (detail?.normalizedAttributes && typeof detail.normalizedAttributes === "object") {
    for (const [key, val] of Object.entries(detail.normalizedAttributes)) {
      if (val === null || val === undefined || typeof val === "object") continue;
      const strVal = String(val).trim();
      if (!strVal) continue;
      const translatedLabel =
        SPEC_LABEL_TRANSLATIONS[key] ||
        key.charAt(0).toUpperCase() + key.slice(1);
      if (!seenLabels.has(translatedLabel.toLowerCase())) {
        rows.push({ label: translatedLabel, value: strVal });
        seenLabels.add(translatedLabel.toLowerCase());
      }
    }
  }

  // 4. Fallback to keySpecs
  if (product.keySpecs && product.keySpecs.length > 0) {
    product.keySpecs.forEach((spec, idx) => {
      const label = `Thông số nổi bật ${idx + 1}`;
      if (!seenLabels.has(label.toLowerCase())) {
        rows.push({ label, value: spec });
        seenLabels.add(label.toLowerCase());
      }
    });
  }

  // 5. Stock & inventory availability
  rows.push({
    label: "Tình trạng kho hàng",
    value: product.inStock
      ? `Còn hàng${product.stockQuantity ? ` (${product.stockQuantity} sản phẩm)` : " (Sẵn sàng xuất kho)"}`
      : "Tạm hết hàng",
  });

  return rows;
}

// ==============================================================================
// Component Props
// ==============================================================================

export interface CatalogClientProps {
  readonly initialProducts: readonly StudioProduct[];
  readonly initialTotal: number;
  readonly initialTotalPages?: number;
  readonly onFetchProductDetail?: (id: string) => Promise<ProductDetail | null>;
  readonly onFetchProducts?: (options: {
    page: number;
    pageSize?: number;
    category?: string;
    brand?: string | null;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    inStockOnly?: boolean;
  }) => Promise<
    Readonly<{
      items: readonly StudioProduct[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>
  >;
}

// ==============================================================================
// Main CatalogClient Component
// ==============================================================================

export function CatalogClient({
  initialProducts,
  initialTotal,
  initialTotalPages = 1,
  onFetchProductDetail,
  onFetchProducts,
}: CatalogClientProps) {
  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRange>("all");
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);

  // Pagination & Products States
  const [products, setProducts] = useState<readonly StudioProduct[]>(initialProducts);
  const [totalCount, setTotalCount] = useState<number>(initialTotal);
  const [totalPages, setTotalPages] = useState<number>(initialTotalPages);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Selected Product Modal State
  const [activeModalProduct, setActiveModalProduct] = useState<StudioProduct | null>(null);
  const [fullProductDetail, setFullProductDetail] = useState<ProductDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);

  // Track initial mount to avoid unnecessary fetch
  const isInitialMount = useRef(true);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Dynamic brands for the active category
  const activeBrands = useMemo(() => {
    return BRANDS_BY_CATEGORY[selectedCategory] || BRANDS_BY_CATEGORY.all;
  }, [selectedCategory]);

  // Load products callback
  const loadProducts = useCallback(
    async (pageToLoad: number) => {
      setIsLoading(true);
      try {
        const priceCfg = PRICE_RANGES.find((p) => p.id === selectedPriceRange);

        if (onFetchProducts) {
          const result = await onFetchProducts({
            page: pageToLoad,
            pageSize: 24,
            category: selectedCategory,
            brand: selectedBrand,
            search: debouncedSearch,
            minPrice: priceCfg?.min,
            maxPrice: priceCfg?.max,
            inStockOnly,
          });
          setProducts(result.items);
          setTotalCount(result.total);
          setTotalPages(result.totalPages);
          setCurrentPage(result.page);
          return;
        }

        // Standard fetch via /api/products
        const query = new URLSearchParams();
        query.set("page", String(pageToLoad));
        query.set("pageSize", "24");
        query.set("productType", selectedCategory === "all" ? "all" : selectedCategory);
        if (selectedBrand) query.set("brand", selectedBrand);
        if (debouncedSearch) query.set("search", debouncedSearch);
        if (priceCfg?.min !== undefined) query.set("minPrice", String(priceCfg.min));
        if (priceCfg?.max !== undefined) query.set("maxPrice", String(priceCfg.max));
        if (inStockOnly) query.set("inStockOnly", "true");

        const response = await fetch(`/api/products?${query.toString()}`);
        if (!response.ok) throw new Error("Catalog service unavailable");

        const data = await response.json();
        setProducts(data.items ?? []);
        setTotalCount(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setCurrentPage(data.page ?? pageToLoad);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedCategory, selectedBrand, debouncedSearch, selectedPriceRange, inStockOnly, onFetchProducts]
  );

  // Trigger load when filters change (skip on first mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentPage(1);
    void loadProducts(1);
  }, [selectedCategory, selectedBrand, debouncedSearch, selectedPriceRange, inStockOnly, loadProducts]);

  // Open modal and fetch full detail
  const handleCardClick = useCallback(
    async (product: StudioProduct) => {
      setActiveModalProduct(product);
      setFullProductDetail(null);

      if (onFetchProductDetail) {
        setIsDetailLoading(true);
        try {
          const detail = await onFetchProductDetail(product.id);
          setFullProductDetail(detail);
        } catch (err) {
          console.error("Error loading product detail:", err);
        } finally {
          setIsDetailLoading(false);
        }
      }
    },
    [onFetchProductDetail]
  );

  // Close modal
  const handleCloseModal = useCallback(() => {
    setActiveModalProduct(null);
    setFullProductDetail(null);
  }, []);

  // Category switch helper
  const handleCategoryChange = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedBrand(null); // Reset brand when switching category
  }, []);

  // Brand pill toggle helper
  const handleBrandClick = useCallback((brand: string | null) => {
    setSelectedBrand((prev) => (prev === brand ? null : brand));
  }, []);

  // Reset all filters helper
  const handleResetFilters = useCallback(() => {
    setSelectedCategory("all");
    setSelectedBrand(null);
    setSearchInput("");
    setDebouncedSearch("");
    setSelectedPriceRange("all");
    setInStockOnly(true);
  }, []);

  return (
    <div className="catalog-showroom-root">
      {/* =========================================================================
          Masthead: Title, Subtitle, Total Count
          ========================================================================= */}
      <section className="catalog-masthead">
        <div className="catalog-masthead__meta">
          <span className="catalog-masthead__badge">
            <span className="catalog-masthead__badge-pulse" />
            Live Showroom Database
          </span>
          <span className="catalog-masthead__count-pill">
            {totalCount > 0 ? `${totalCount.toLocaleString("vi-VN")} máy` : "3.977 máy"}
          </span>
        </div>
        <h1 className="catalog-masthead__title">
          Khám Phá Toàn Bộ Catalog
          <span className="catalog-masthead__title-tag">
            ({totalCount > 0 ? totalCount.toLocaleString("vi-VN") : "3.977"} máy)
          </span>
        </h1>
        <p className="catalog-masthead__subtitle">
          Toàn bộ thiết bị phần cứng, laptop và linh kiện gaming studio chính hãng sẵn sàng đưa vào Video Studio để khởi tạo video AI tự động chuẩn xác từng thông số.
        </p>
      </section>

      {/* =========================================================================
          Filter Panel: Controls, Categories, Search, Brands, Price, In-stock Toggle
          ========================================================================= */}
      <section className="catalog-showroom-controls" aria-label="Bộ lọc catalog">
        {/* Category Tabs */}
        <div className="catalog-filter-group">
          <span className="catalog-filter-label">Danh mục sản phẩm</span>
          <div className="catalog-tabs-container">
            {CATEGORY_TABS.map((tab) => {
              const isActive = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleCategoryChange(tab.id)}
                  className={`catalog-tab-btn ${isActive ? "active" : ""}`}
                  aria-pressed={isActive}
                >
                  <span className="catalog-tab-btn__label">{tab.label}</span>
                  <span className="catalog-tab-btn__count">
                    ({tab.id === "all" ? (totalCount > 0 ? totalCount.toLocaleString("vi-VN") : tab.count.toLocaleString("vi-VN")) : tab.count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar & Stock Toggle */}
        <div className="catalog-search-row">
          <div className="catalog-search-wrapper">
            <svg
              className="catalog-search-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="18" y2="18" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên sản phẩm, mã SKU, thương hiệu..."
              className="catalog-search-input"
              aria-label="Tìm kiếm sản phẩm trong catalog"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="catalog-search-clear"
                aria-label="Xóa nội dung tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <label className="catalog-stock-toggle-label">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="catalog-stock-toggle-checkbox"
            />
            <span className="catalog-stock-toggle-slider" />
            <span className="catalog-stock-toggle-text">🟢 Chỉ còn hàng</span>
          </label>
        </div>

        {/* Brand Pills */}
        <div className="catalog-filter-group">
          <span className="catalog-filter-label">Thương hiệu</span>
          <div className="catalog-pills-container">
            <button
              type="button"
              onClick={() => handleBrandClick(null)}
              className={`catalog-pill-btn ${selectedBrand === null ? "active" : ""}`}
            >
              Tất cả hãng
            </button>
            {activeBrands.map((brand) => {
              const isSelected = selectedBrand === brand;
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => handleBrandClick(brand)}
                  className={`catalog-pill-btn ${isSelected ? "active" : ""}`}
                >
                  {brand}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price Range Pills */}
        <div className="catalog-filter-group">
          <span className="catalog-filter-label">Khoảng giá</span>
          <div className="catalog-pills-container">
            {PRICE_RANGES.map((range) => {
              const isSelected = selectedPriceRange === range.id;
              return (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setSelectedPriceRange(range.id)}
                  className={`catalog-pill-btn ${isSelected ? "active" : ""}`}
                >
                  {range.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          Catalog Showroom Grid
          ========================================================================= */}
      <section className="catalog-grid-section" aria-label="Danh sách sản phẩm showroom">
        {/* Results Bar */}
        <div className="catalog-results-bar">
          <span className="catalog-results-count">
            Hiển thị <strong>{products.length}</strong> / <strong>{totalCount.toLocaleString("vi-VN")}</strong> sản phẩm
          </span>
          {isLoading && (
            <span className="catalog-loading-indicator">
              <span className="catalog-loading-spinner" /> Đang cập nhật dữ liệu...
            </span>
          )}
        </div>

        {/* Empty State */}
        {!isLoading && products.length === 0 && (
          <div className="catalog-empty-card">
            <div className="catalog-empty-card__icon">📦</div>
            <h3 className="catalog-empty-card__title">Không tìm thấy sản phẩm phù hợp</h3>
            <p className="catalog-empty-card__text">
              Thử tìm kiếm với từ khóa khác, chọn thương hiệu khác hoặc nới lỏng khoảng giá lọc.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn catalog-reset-btn"
            >
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}

        {/* Showroom Cards Grid */}
        <div className={`catalog-showroom-grid ${isLoading ? "is-loading-dim" : ""}`}>
          {products.map((product) => {
            const stockBadgeText = product.inStock
              ? product.stockQuantity !== null && product.stockQuantity > 0
                ? `Còn hàng (${product.stockQuantity})`
                : "Còn hàng"
              : "Tạm hết hàng";

            return (
              <article
                key={product.id}
                className="showroom-card"
                onClick={() => void handleCardClick(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handleCardClick(product);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Xem chi tiết ${product.name}`}
              >
                {/* Thumbnail */}
                <div className="showroom-card__thumb">
                  {product.primaryImageUrl ? (
                    <img
                      src={product.primaryImageUrl}
                      alt={product.name}
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        const fallback = e.currentTarget.parentElement?.querySelector(".showroom-fallback-icon");
                        if (fallback) (fallback as HTMLElement).style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="showroom-fallback-icon"
                    style={{ display: product.primaryImageUrl ? "none" : "flex" }}
                    aria-hidden="true"
                  >
                    🖥️
                  </div>

                  {/* Stock Badge on image */}
                  <span className={`showroom-stock-badge ${product.inStock ? "in-stock" : "out-of-stock"}`}>
                    {stockBadgeText}
                  </span>
                </div>

                {/* Body */}
                <div className="showroom-card__body">
                  <div className="showroom-card__meta-top">
                    {product.brand && (
                      <span className="showroom-brand-badge">{product.brand}</span>
                    )}
                    {product.sku && (
                      <span className="showroom-sku-pill">SKU: {product.sku}</span>
                    )}
                  </div>

                  <h3 className="showroom-card__title" title={product.name}>
                    {product.name}
                  </h3>

                  {/* Key specs pills */}
                  {product.keySpecs && product.keySpecs.length > 0 && (
                    <div className="showroom-card__specs">
                      {product.keySpecs.slice(0, 3).map((spec, idx) => (
                        <span key={idx} className="showroom-spec-pill">
                          {spec}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Price */}
                  <div className="showroom-card__price-wrap">
                    <span className="showroom-card__price">
                      {currencyFormatter.format(product.priceVnd)}
                    </span>
                    <span className="showroom-card__cta-hint">Xem chi tiết &rarr;</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="catalog-pagination">
            <button
              type="button"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => {
                const prev = Math.max(1, currentPage - 1);
                setCurrentPage(prev);
                void loadProducts(prev);
              }}
              className="btn catalog-page-btn"
            >
              &larr; Trang trước
            </button>

            <span className="catalog-page-status">
              Trang <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => {
                const next = Math.min(totalPages, currentPage + 1);
                setCurrentPage(next);
                void loadProducts(next);
              }}
              className="btn catalog-page-btn"
            >
              Trang sau &rarr;
            </button>
          </div>
        )}
      </section>

      {/* =========================================================================
          ProductDetailModal
          ========================================================================= */}
      {activeModalProduct && (
        <ProductDetailModal
          product={activeModalProduct}
          detail={fullProductDetail}
          isLoading={isDetailLoading}
          onClose={handleCloseModal}
        />
      )}

      {/* Scoped CSS styling matching Modern Studio Pro tokens */}
      <style jsx>{`
        .catalog-showroom-root {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
          width: 100%;
        }

        /* Masthead */
        .catalog-masthead {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--line);
        }
        .catalog-masthead__meta {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .catalog-masthead__badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--brand-primary-subtle);
          color: var(--brand-primary);
          border: 1px solid var(--brand-primary-border);
          border-radius: var(--radius-full);
          padding: 2px 10px;
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .catalog-masthead__badge-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--brand-primary);
          box-shadow: 0 0 6px var(--brand-primary);
        }
        .catalog-masthead__count-pill {
          background: var(--bg-surface);
          color: var(--ink-secondary);
          border: 1px solid var(--line);
          border-radius: var(--radius-full);
          padding: 2px 10px;
          font-size: var(--text-xs);
          font-weight: 700;
        }
        .catalog-masthead__title {
          font-size: clamp(1.6rem, 2.5vw, 2.1rem);
          font-weight: 800;
          color: var(--ink-primary);
          letter-spacing: -0.03em;
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 10px;
        }
        .catalog-masthead__title-tag {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--teal);
        }
        .catalog-masthead__subtitle {
          color: var(--ink-muted);
          font-size: var(--text-base);
          max-width: 860px;
          line-height: 1.5;
        }

        /* Filter Controls */
        .catalog-filter-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .catalog-filter-label {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink-muted);
        }
        .catalog-tabs-container {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: thin;
        }
        .catalog-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--radius-full);
          border: 1px solid var(--line);
          background: var(--bg-surface);
          color: var(--ink-secondary);
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .catalog-tab-btn:hover {
          background: var(--bg-subtle);
          border-color: var(--ink-subtle);
          color: var(--ink-primary);
        }
        .catalog-tab-btn.active {
          background: var(--brand-primary);
          border-color: var(--brand-primary);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35);
        }
        .catalog-tab-btn__count {
          font-size: var(--text-xs);
          opacity: 0.85;
          font-weight: 500;
        }

        /* Search Row */
        .catalog-search-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .catalog-search-wrapper {
          position: relative;
          flex: 1;
          min-width: 260px;
          display: flex;
          align-items: center;
        }
        .catalog-search-icon {
          position: absolute;
          left: 12px;
          width: 18px;
          height: 18px;
          color: var(--ink-muted);
          pointer-events: none;
        }
        .catalog-search-input {
          width: 100%;
          padding: 10px 36px 10px 38px;
          border-radius: var(--radius-md);
          border: 1px solid var(--line);
          background: var(--bg-surface);
          color: var(--ink-primary);
          font-size: var(--text-sm);
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .catalog-search-input:focus {
          outline: none;
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 3px var(--brand-primary-subtle);
        }
        .catalog-search-clear {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          color: var(--ink-muted);
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
        }
        .catalog-search-clear:hover {
          color: var(--ink-primary);
        }

        /* Stock Toggle */
        .catalog-stock-toggle-label {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--ink-primary);
        }
        .catalog-stock-toggle-checkbox {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }
        .catalog-stock-toggle-slider {
          width: 38px;
          height: 22px;
          background-color: var(--bg-muted);
          border-radius: var(--radius-full);
          position: relative;
          transition: background-color 0.2s ease;
        }
        .catalog-stock-toggle-slider::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: var(--shadow-xs);
          transition: transform 0.2s ease;
        }
        .catalog-stock-toggle-checkbox:checked + .catalog-stock-toggle-slider {
          background-color: var(--emerald);
        }
        .catalog-stock-toggle-checkbox:checked + .catalog-stock-toggle-slider::after {
          transform: translateX(16px);
        }

        /* Pills */
        .catalog-pills-container {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .catalog-pill-btn {
          padding: 6px 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--line);
          background: var(--bg-surface);
          color: var(--ink-secondary);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .catalog-pill-btn:hover {
          background: var(--bg-subtle);
          border-color: var(--ink-subtle);
        }
        .catalog-pill-btn.active {
          background: var(--ink-primary);
          border-color: var(--ink-primary);
          color: #ffffff;
        }

        /* Results Bar */
        .catalog-results-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px;
          margin-bottom: var(--space-3);
          font-size: var(--text-sm);
          color: var(--ink-muted);
        }
        .catalog-results-count strong {
          color: var(--ink-primary);
        }
        .catalog-loading-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--brand-primary);
          font-weight: 600;
          font-size: var(--text-xs);
        }
        .catalog-loading-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid var(--brand-primary-border);
          border-top-color: var(--brand-primary);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Empty State */
        .catalog-empty-card {
          padding: 48px 24px;
          text-align: center;
          background: var(--bg-surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .catalog-empty-card__icon {
          font-size: 3rem;
        }
        .catalog-empty-card__title {
          font-size: var(--text-lg);
          font-weight: 700;
          color: var(--ink-primary);
        }
        .catalog-empty-card__text {
          color: var(--ink-muted);
          font-size: var(--text-sm);
          max-width: 480px;
        }
        .catalog-reset-btn {
          margin-top: 8px;
          background: var(--brand-primary);
          color: #ffffff;
          border-color: var(--brand-primary);
        }
        .catalog-reset-btn:hover {
          background: var(--brand-primary-hover);
        }

        /* Card Enhancements */
        .is-loading-dim {
          opacity: 0.6;
          pointer-events: none;
        }
        .showroom-fallback-icon {
          font-size: 3rem;
          color: var(--ink-subtle);
        }
        .showroom-stock-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: var(--text-xs);
          font-weight: 700;
          padding: 3px 8px;
          border-radius: var(--radius-full);
          backdrop-filter: blur(4px);
        }
        .showroom-stock-badge.in-stock {
          background: rgba(236, 253, 245, 0.9);
          color: var(--emerald);
          border: 1px solid var(--emerald-border);
        }
        .showroom-stock-badge.out-of-stock {
          background: rgba(241, 245, 249, 0.9);
          color: var(--ink-muted);
          border: 1px solid var(--line);
        }
        .showroom-card__meta-top {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .showroom-brand-badge {
          background: var(--brand-primary-subtle);
          color: var(--brand-primary);
          font-size: var(--text-xs);
          font-weight: 700;
          padding: 2px 6px;
          border-radius: var(--radius-xs);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .showroom-sku-pill {
          font-size: var(--text-xs);
          color: var(--ink-muted);
          font-family: var(--font-mono);
        }
        .showroom-card__specs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .showroom-spec-pill {
          background: var(--bg-subtle);
          color: var(--ink-secondary);
          border: 1px solid var(--line);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: var(--radius-xs);
          white-space: nowrap;
        }
        .showroom-card__price-wrap {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 8px;
          border-top: 1px solid var(--bg-subtle);
        }
        .showroom-card__cta-hint {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--brand-primary);
          opacity: 0.85;
        }

        /* Pagination Controls */
        .catalog-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--line);
        }
        .catalog-page-status {
          font-size: var(--text-sm);
          color: var(--ink-muted);
        }
        .catalog-page-status strong {
          color: var(--ink-primary);
        }
        .catalog-page-btn {
          padding: 8px 16px;
          font-size: var(--text-sm);
        }
      `}</style>
    </div>
  );
}

// ==============================================================================
// ProductDetailModal Component
// ==============================================================================

interface ProductDetailModalProps {
  readonly product: StudioProduct;
  readonly detail: ProductDetail | null;
  readonly isLoading: boolean;
  readonly onClose: () => void;
}

function ProductDetailModal({
  product,
  detail,
  isLoading,
  onClose,
}: ProductDetailModalProps) {
  const titleId = useId();

  // Aggregate all high-res image URLs
  const allImages = useMemo(() => {
    const urls: string[] = [];
    if (detail?.images && Array.isArray(detail.images)) {
      for (const img of detail.images) {
        if (img.sourceUrl && !urls.includes(img.sourceUrl)) {
          urls.push(img.sourceUrl);
        }
      }
    }
    if (urls.length === 0 && product.primaryImageUrl) {
      urls.push(product.primaryImageUrl);
    }
    return urls;
  }, [detail, product.primaryImageUrl]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Format specifications table rows
  const specRows = useMemo(() => {
    return formatSpecificationRows(product, detail);
  }, [product, detail]);

  const currentImage = allImages[activeImageIndex] ?? product.primaryImageUrl;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-dialog__header">
          <div>
            <div className="modal-header__brand-row">
              {product.brand && (
                <span className="modal-brand-badge">{product.brand}</span>
              )}
              {product.sku && (
                <span className="modal-sku-badge">SKU: {product.sku}</span>
              )}
            </div>
            <h2 id={titleId} className="modal-header__title">
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ chi tiết"
          >
            ✕
          </button>
        </div>

        {/* Body (Left: Carousel, Right: Specs & Action) */}
        <div className="modal-dialog__body">
          {/* Left: Full Image Carousel & Thumbnails */}
          <div className="modal-image-col">
            <div className="modal-image-viewport">
              {currentImage ? (
                <img
                  src={currentImage}
                  alt={product.name}
                  className="modal-image-main"
                />
              ) : (
                <div className="modal-image-placeholder">🖥️ Không có hình ảnh</div>
              )}

              {allImages.length > 1 && (
                <div className="modal-image-nav">
                  <button
                    type="button"
                    className="modal-nav-arrow prev"
                    onClick={() =>
                      setActiveImageIndex((prev) =>
                        prev === 0 ? allImages.length - 1 : prev - 1
                      )
                    }
                    aria-label="Ảnh trước"
                  >
                    &#8249;
                  </button>
                  <span className="modal-image-counter">
                    {activeImageIndex + 1} / {allImages.length}
                  </span>
                  <button
                    type="button"
                    className="modal-nav-arrow next"
                    onClick={() =>
                      setActiveImageIndex((prev) =>
                        prev === allImages.length - 1 ? 0 : prev + 1
                      )
                    }
                    aria-label="Ảnh tiếp"
                  >
                    &#8250;
                  </button>
                </div>
              )}
            </div>

            {/* Thumbnail Strip */}
            {allImages.length > 1 && (
              <div className="modal-thumbnails-strip">
                {allImages.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`modal-thumb-btn ${idx === activeImageIndex ? "active" : ""}`}
                    aria-label={`Chọn ảnh số ${idx + 1}`}
                  >
                    <img src={imgUrl} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Technical Attributes Table & Studio CTA */}
          <div className="modal-info-col">
            {/* Price & Stock status block */}
            <div className="modal-price-stock-box">
              <div className="modal-price-val">
                {currencyFormatter.format(product.priceVnd)}
              </div>
              <span
                className={`modal-stock-badge ${
                  product.inStock ? "in-stock" : "out-of-stock"
                }`}
              >
                {product.inStock
                  ? `Còn hàng${
                      product.stockQuantity
                        ? ` (${product.stockQuantity} sản phẩm)`
                        : ""
                    }`
                  : "Tạm hết hàng"}
              </span>
            </div>

            {/* Specifications Section */}
            <div className="modal-specs-section">
              <div className="modal-specs-header">
                <h4 className="modal-specs-title">Bảng Thông Số Kỹ Thuật Chi Tiết</h4>
                {isLoading && (
                  <span className="modal-specs-loading">Đang nạp chi tiết...</span>
                )}
              </div>

              <div className="modal-specs-table-wrap">
                <table className="modal-specs-table">
                  <tbody>
                    {specRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="modal-spec-label">{row.label}</td>
                        <td className="modal-spec-value">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Button: Link to Studio */}
            <div className="modal-action-wrapper">
              <Link
                href={`/?selectedId=${encodeURIComponent(product.id)}`}
                className="btn-create-video modal-cta-link"
              >
                🎬 Đưa vào Studio dựng video ngay
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped CSS for Modal */}
      <style jsx>{`
        .modal-header__brand-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .modal-brand-badge {
          background: var(--brand-primary-subtle);
          color: var(--brand-primary);
          border-radius: var(--radius-xs);
          padding: 2px 8px;
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .modal-sku-badge {
          color: var(--ink-muted);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
        }
        .modal-header__title {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--ink-primary);
          line-height: 1.35;
          margin: 0;
        }

        /* Left Image Column */
        .modal-image-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .modal-image-viewport {
          width: 100%;
          height: 320px;
          background: #f8fafc;
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 16px;
        }
        .modal-image-main {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .modal-image-placeholder {
          font-size: 1.1rem;
          color: var(--ink-muted);
          font-weight: 600;
        }
        .modal-image-nav {
          position: absolute;
          bottom: 10px;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          pointer-events: none;
        }
        .modal-nav-arrow {
          pointer-events: auto;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid var(--line);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
          font-weight: bold;
          color: var(--ink-primary);
          cursor: pointer;
          box-shadow: var(--shadow-sm);
        }
        .modal-nav-arrow:hover {
          background: #ffffff;
          box-shadow: var(--shadow-md);
        }
        .modal-image-counter {
          background: rgba(15, 23, 42, 0.7);
          color: #ffffff;
          font-size: var(--text-xs);
          font-weight: 700;
          padding: 2px 10px;
          border-radius: var(--radius-full);
          backdrop-filter: blur(4px);
        }
        .modal-thumbnails-strip {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 4px 0;
          scrollbar-width: thin;
        }
        .modal-thumb-btn {
          width: 58px;
          height: 58px;
          border-radius: var(--radius-md);
          border: 1px solid var(--line);
          background: #f8fafc;
          padding: 4px;
          cursor: pointer;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .modal-thumb-btn img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .modal-thumb-btn.active {
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 2px var(--brand-primary-border);
        }

        /* Right Info Column */
        .modal-info-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-price-stock-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--line);
        }
        .modal-price-val {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--teal);
          letter-spacing: -0.02em;
        }
        .modal-stock-badge {
          font-size: var(--text-xs);
          font-weight: 700;
          padding: 4px 10px;
          border-radius: var(--radius-full);
        }
        .modal-stock-badge.in-stock {
          background: var(--emerald-light);
          color: var(--emerald);
          border: 1px solid var(--emerald-border);
        }
        .modal-stock-badge.out-of-stock {
          background: var(--bg-subtle);
          color: var(--ink-muted);
          border: 1px solid var(--line);
        }

        /* Specs Section */
        .modal-specs-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }
        .modal-specs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-specs-title {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink-muted);
          margin: 0;
        }
        .modal-specs-loading {
          font-size: var(--text-xs);
          color: var(--brand-primary);
          font-weight: 600;
        }
        .modal-specs-table-wrap {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          max-height: 250px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .modal-specs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--text-xs);
        }
        .modal-specs-table tr {
          border-bottom: 1px solid var(--line);
        }
        .modal-specs-table tr:last-child {
          border-bottom: none;
        }
        .modal-specs-table tr:nth-child(even) {
          background: var(--bg-subtle);
        }
        .modal-spec-label {
          padding: 8px 12px;
          font-weight: 700;
          color: var(--ink-secondary);
          width: 42%;
          border-right: 1px solid var(--line);
          vertical-align: top;
        }
        .modal-spec-value {
          padding: 8px 12px;
          color: var(--ink-primary);
          font-weight: 500;
          vertical-align: top;
        }

        /* Action Link */
        .modal-action-wrapper {
          margin-top: 8px;
        }
        .modal-cta-link {
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-weight: 700;
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
}
