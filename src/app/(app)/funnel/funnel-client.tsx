// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CategoryMetric = Readonly<{
  productType: string;
  productTypeNameVi: string;
  productCount: number;
  renderedCount: number;
  coveragePercent: number;
  status: "covered" | "partial" | "unexplored";
}>;

export type TokenMetrics = Readonly<{
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
}>;

export type PerformanceMetrics = Readonly<{
  avgDurationMs: number;
  avgDurationSeconds: number;
  estimatedCostSavedVnd: number;
  estimatedHoursSaved: number;
}>;

export type FunnelMetrics = Readonly<{
  stage1TotalProducts: number;
  stage2ContentReady: number;
  stage2ConversionRate: number;
  stage3VideoAttempts: number;
  stage3VideoSuccesses: number;
  stage3VideoFailures: number;
  stage4UniqueProductsRendered: number;
  stage4UniqueProductsUnrendered: number;
  stage4SuccessRate: number;
  tokenMetrics: TokenMetrics;
  performanceMetrics: PerformanceMetrics;
  categories: readonly CategoryMetric[];
}>;

function formatVnd(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu đ`;
  }
  return `${amount.toLocaleString("vi-VN")} đ`;
}

export function FunnelClient({ metrics }: Readonly<{ metrics: FunnelMetrics }>) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | "covered" | "unexplored">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"count" | "rendered" | "name">("count");

  // Summary counts for filter tabs
  const coveredCount = useMemo(
    () => metrics.categories.filter((c) => c.renderedCount > 0).length,
    [metrics.categories],
  );
  const unexploredCount = useMemo(
    () => metrics.categories.filter((c) => c.renderedCount === 0).length,
    [metrics.categories],
  );

  // Filter and sort category rows
  const filteredCategories = useMemo(() => {
    return metrics.categories
      .filter((cat) => {
        if (categoryFilter === "covered" && cat.renderedCount === 0) return false;
        if (categoryFilter === "unexplored" && cat.renderedCount > 0) return false;

        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const matchName = cat.productTypeNameVi.toLowerCase().includes(q);
          const matchSlug = cat.productType.toLowerCase().includes(q);
          return matchName || matchSlug;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "count") {
          return b.productCount - a.productCount;
        }
        if (sortBy === "rendered") {
          if (b.renderedCount !== a.renderedCount) {
            return b.renderedCount - a.renderedCount;
          }
          return b.productCount - a.productCount;
        }
        return a.productTypeNameVi.localeCompare(b.productTypeNameVi, "vi");
      });
  }, [metrics.categories, categoryFilter, searchQuery, sortBy]);

  // Overall catalog coverage percent
  const overallCoveragePercent = useMemo(() => {
    if (metrics.stage2ContentReady === 0) return 0;
    return (metrics.stage4UniqueProductsRendered / metrics.stage2ContentReady) * 100;
  }, [metrics.stage2ContentReady, metrics.stage4UniqueProductsRendered]);

  return (
    <div className="funnel-pipeline-deck" style={{ paddingBottom: "var(--space-8)" }}>
      {/* 1. Masthead */}
      <header className="page-masthead">
        <div className="page-masthead__title">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                color: "var(--brand-primary)",
                background: "var(--brand-primary-subtle)",
                border: "1px solid var(--brand-primary-border)",
                padding: "3px 10px",
                borderRadius: "var(--radius-full)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--brand-primary)",
                  boxShadow: "0 0 8px var(--brand-primary)",
                }}
              />
              Báo Cáo Tiếp Thị &amp; AI
            </span>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--ink-muted)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--line)",
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
              }}
            >
              Dữ liệu thời gian thực
            </span>
          </div>
          <h1>Marketing Funnel &amp; AI Performance</h1>
          <p>
            Phân tích tỷ lệ chuyển đổi từ toàn bộ kho linh kiện &amp; thiết bị sang video tiếp thị AI tự động, đánh giá hiệu suất mô hình và tài nguyên tiết kiệm.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/"
            className="btn"
            style={{
              background: "var(--brand-primary)",
              color: "#ffffff",
              borderColor: "var(--brand-primary)",
              boxShadow: "var(--shadow-sm)",
              fontWeight: 700,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" opacity="0.2" />
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Tạo Video Ngay
          </Link>
        </div>
      </header>

      {/* 2. Funnel Flow Visualization */}
      <section aria-labelledby="funnel-flow-heading" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="funnel-flow-heading" style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
            Tiến Trình Chuyển Đổi Funnel (4 Giai Đoạn)
          </h2>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
            Từ Catalog gốc &rarr; Sản phẩm sẵn sàng &rarr; Video AI &rarr; Tỷ lệ hoàn thành
          </span>
        </div>

        <div className="funnel-flow-container">
          {/* Step 1: Tổng Catalog Sản phẩm */}
          <article className="funnel-stage-card" aria-label="Giai đoạn 1: Tổng Catalog Sản phẩm">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                Giai đoạn 1
              </span>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--bg-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--ink-secondary)",
                }}
              >
                1
              </span>
            </div>
            <div className="funnel-stage-card__number">
              {metrics.stage1TotalProducts.toLocaleString("vi-VN")}
            </div>
            <div className="funnel-stage-card__label">Tổng Catalog Sản phẩm</div>
            <div className="funnel-stage-card__conversion">
              100% kho dữ liệu gốc
            </div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "4px 0 0" }}>
              Toàn bộ danh mục 39 nhóm sản phẩm, thiết bị &amp; linh kiện GearVN.
            </p>
          </article>

          {/* Step 2: Sẵn sàng Tiếp thị */}
          <article className="funnel-stage-card" aria-label="Giai đoạn 2: Sẵn sàng Tiếp thị">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--brand-primary)",
                  letterSpacing: "0.05em",
                }}
              >
                Giai đoạn 2
              </span>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--brand-primary-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--brand-primary)",
                }}
              >
                2
              </span>
            </div>
            <div className="funnel-stage-card__number">
              {metrics.stage2ContentReady.toLocaleString("vi-VN")}
            </div>
            <div className="funnel-stage-card__label">Sẵn sàng Tiếp thị</div>
            <div
              className="funnel-stage-card__conversion"
              style={{
                background: "var(--emerald-light)",
                color: "var(--emerald)",
                border: "1px solid var(--emerald-border)",
              }}
            >
              {metrics.stage2ConversionRate.toFixed(1)}% conversion
            </div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "4px 0 0" }}>
              Đạt chuẩn Usable, đầy đủ hình ảnh chất lượng cao và thông số kỹ thuật.
            </p>
          </article>

          {/* Step 3: Video AI Đã Sản Xuất */}
          <article className="funnel-stage-card" aria-label="Giai đoạn 3: Video AI Đã Sản Xuất">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--teal)",
                  letterSpacing: "0.05em",
                }}
              >
                Giai đoạn 3
              </span>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--teal-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--teal)",
                }}
              >
                3
              </span>
            </div>
            <div className="funnel-stage-card__number" style={{ color: "var(--teal)" }}>
              {metrics.stage3VideoSuccesses.toLocaleString("vi-VN")}
            </div>
            <div className="funnel-stage-card__label">Video AI Đã Sản Xuất</div>
            <div
              className="funnel-stage-card__conversion"
              style={{
                background: "var(--teal-light)",
                color: "var(--teal)",
                border: "1px solid var(--teal-border)",
              }}
            >
              {metrics.stage3VideoAttempts} lượt render
            </div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "4px 0 0" }}>
              Video hoàn chỉnh kèm kịch bản AI, lồng tiếng tự nhiên và render HD.
            </p>
          </article>

          {/* Step 4: Tỷ Lệ Hoàn Thành */}
          <article className="funnel-stage-card" aria-label="Giai đoạn 4: Tỷ Lệ Hoàn Thành">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--brand-secondary)",
                  letterSpacing: "0.05em",
                }}
              >
                Giai đoạn 4
              </span>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--bg-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--brand-secondary)",
                }}
              >
                4
              </span>
            </div>
            <div className="funnel-stage-card__number" style={{ color: "var(--brand-secondary)" }}>
              {metrics.stage4SuccessRate.toFixed(1)}%
            </div>
            <div className="funnel-stage-card__label">Tỷ Lệ Hoàn Thành</div>
            <div
              className="funnel-stage-card__conversion"
              style={{
                background: "var(--brand-primary-subtle)",
                color: "var(--brand-primary)",
                border: "1px solid var(--brand-primary-border)",
              }}
            >
              {metrics.stage4UniqueProductsRendered} sản phẩm đã phủ
            </div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "4px 0 0" }}>
              Tỷ lệ render thành công trên tổng số lệnh sản xuất video được gửi.
            </p>
          </article>
        </div>
      </section>

      {/* 3. AI Efficiency & Performance KPI Cards */}
      <section aria-labelledby="ai-performance-heading" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 id="ai-performance-heading" style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
              Hiệu Suất AI &amp; Tài Nguyên Tiết Kiệm
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "2px 0 0" }}>
              Đo lường lượng token mô hình ngôn ngữ tiêu thụ, tốc độ kết xuất và giá trị kinh tế mang lại.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          {/* KPI 1: AI Tokens */}
          <article className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  color: "var(--ink-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Tổng Token AI Tiêu Thụ
              </span>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--brand-primary-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  color: "var(--ink-primary)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                }}
              >
                {metrics.tokenMetrics.tokensTotal.toLocaleString("vi-VN")}
              </p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                Tokens (Prompt &amp; Kịch bản AI)
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                padding: "8px 10px",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-xs)",
              }}
            >
              <div>
                <span style={{ color: "var(--ink-muted)", display: "block" }}>Tokens Input</span>
                <strong style={{ color: "var(--ink-primary)" }}>
                  {metrics.tokenMetrics.tokensInput.toLocaleString("vi-VN")}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--ink-muted)", display: "block" }}>Tokens Output</span>
                <strong style={{ color: "var(--ink-primary)" }}>
                  {metrics.tokenMetrics.tokensOutput.toLocaleString("vi-VN")}
                </strong>
              </div>
            </div>
          </article>

          {/* KPI 2: Thời Gian Render Trung Bình */}
          <article className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  color: "var(--ink-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Thời Gian Render TB
              </span>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--teal-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  color: "var(--ink-primary)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                }}
              >
                {metrics.performanceMetrics.avgDurationSeconds.toFixed(1)}{" "}
                <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>giây</span>
              </p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                {metrics.performanceMetrics.avgDurationMs.toLocaleString("vi-VN")} ms / video HD
              </span>
            </div>

            <div
              style={{
                padding: "8px 10px",
                background: "var(--teal-light)",
                border: "1px solid var(--teal-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--teal)",
                fontWeight: 600,
              }}
            >
              Tốc độ kết xuất nhanh hơn ~120x so với biên tập thủ công
            </div>
          </article>

          {/* KPI 3: Ước Tính Tiết Kiệm Chi Phí */}
          <article className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  color: "var(--ink-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Ước Tính Tiết Kiệm
              </span>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--emerald-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--emerald)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.78.77L12 20.66l7.65-7.66.78-.77a5.4 5.4 0 0 0 0-7.65z" />
                </svg>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  color: "var(--emerald)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                }}
              >
                {formatVnd(metrics.performanceMetrics.estimatedCostSavedVnd)}
              </p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                Tiết kiệm chi phí sản xuất video
              </span>
            </div>

            <div
              style={{
                padding: "8px 10px",
                background: "var(--emerald-light)",
                border: "1px solid var(--emerald-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--emerald)",
                fontWeight: 600,
              }}
            >
              Tiết kiệm ~{metrics.performanceMetrics.estimatedHoursSaved.toFixed(1)} giờ biên tập &amp; dựng hình
            </div>
          </article>

          {/* KPI 4: Mức Độ Phủ Catalog */}
          <article className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  color: "var(--ink-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Độ Phủ Catalog Sản Phẩm
              </span>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--brand-primary-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: "1.9rem",
                  fontWeight: 800,
                  color: "var(--ink-primary)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                }}
              >
                {metrics.stage4UniqueProductsRendered}{" "}
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink-muted)" }}>
                  / {metrics.stage2ContentReady.toLocaleString("vi-VN")}
                </span>
              </p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                {overallCoveragePercent.toFixed(2)}% tổng số máy sẵn sàng nội dung
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: "6px",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
                marginTop: "4px",
              }}
            >
              <div
                style={{
                  width: `${Math.max(1, Math.min(100, overallCoveragePercent))}%`,
                  height: "100%",
                  background: "var(--brand-primary)",
                  borderRadius: "var(--radius-full)",
                }}
              />
            </div>
          </article>
        </div>
      </section>

      {/* 4. Category Coverage Matrix */}
      <section aria-labelledby="category-matrix-heading" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 id="category-matrix-heading" style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
              Ma Trận Phủ Video Theo Danh Mục (Category Coverage Matrix)
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: "2px 0 0" }}>
              So sánh số lượng sản phẩm và video chiến dịch đã tạo trên từng nhóm hàng, giúp phát hiện cơ hội tiếp thị chưa khai thác.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--emerald)",
                background: "var(--emerald-light)",
                border: "1px solid var(--emerald-border)",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {coveredCount} nhóm đã có video
            </span>
            <span
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--amber)",
                background: "var(--amber-light)",
                border: "1px solid var(--amber-border)",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {unexploredCount} nhóm chưa khai thác
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            padding: "12px 16px",
            background: "var(--bg-surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              style={{
                padding: "6px 12px",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                borderRadius: "var(--radius-md)",
                border: "1px solid",
                borderColor: categoryFilter === "all" ? "var(--brand-primary)" : "var(--line)",
                background: categoryFilter === "all" ? "var(--brand-primary)" : "var(--bg-surface)",
                color: categoryFilter === "all" ? "#ffffff" : "var(--ink-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Tất cả ({metrics.categories.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("covered")}
              style={{
                padding: "6px 12px",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                borderRadius: "var(--radius-md)",
                border: "1px solid",
                borderColor: categoryFilter === "covered" ? "var(--teal)" : "var(--line)",
                background: categoryFilter === "covered" ? "var(--teal)" : "var(--bg-surface)",
                color: categoryFilter === "covered" ? "#ffffff" : "var(--ink-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Đã có video ({coveredCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("unexplored")}
              style={{
                padding: "6px 12px",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                borderRadius: "var(--radius-md)",
                border: "1px solid",
                borderColor: categoryFilter === "unexplored" ? "var(--amber)" : "var(--line)",
                background: categoryFilter === "unexplored" ? "var(--amber)" : "var(--bg-surface)",
                color: categoryFilter === "unexplored" ? "#ffffff" : "var(--ink-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Chưa khai thác ({unexploredCount})
            </button>
          </div>

          {/* Search & Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Tìm danh mục..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "6px 12px 6px 30px",
                  fontSize: "var(--text-xs)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--line)",
                  background: "var(--bg-subtle)",
                  color: "var(--ink-primary)",
                  outline: "none",
                  width: "180px",
                  fontFamily: "inherit",
                }}
              />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-muted)",
                }}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "count" | "rendered" | "name")}
              style={{
                padding: "6px 10px",
                fontSize: "var(--text-xs)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-surface)",
                color: "var(--ink-primary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              aria-label="Sắp xếp danh mục"
            >
              <option value="count">Xếp theo số sản phẩm</option>
              <option value="rendered">Xếp theo video đã tạo</option>
              <option value="name">Xếp theo tên (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Category Table */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Danh Mục Sản Phẩm</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Tổng Sản Phẩm</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Video Đã Tạo</th>
                  <th style={{ width: "22%" }}>Tỷ Lệ Bao Phủ</th>
                  <th style={{ width: "18%", textAlign: "center" }}>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--ink-muted)" }}>
                      Không tìm thấy danh mục phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => {
                    const maxProducts = metrics.categories[0]?.productCount || 529;
                    const relativeWidth = Math.max(4, Math.round((cat.productCount / maxProducts) * 100));

                    return (
                      <tr key={cat.productType}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <strong style={{ color: "var(--ink-primary)", fontSize: "var(--text-sm)" }}>
                              {cat.productTypeNameVi}
                            </strong>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
                              {cat.productType}
                            </span>
                          </div>
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>
                            {cat.productCount.toLocaleString("vi-VN")}
                          </span>
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontWeight: 800,
                              color: cat.renderedCount > 0 ? "var(--teal)" : "var(--ink-muted)",
                            }}
                          >
                            {cat.renderedCount}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: cat.renderedCount > 0 ? "var(--teal)" : "var(--ink-muted)",
                                }}
                              >
                                {cat.coveragePercent.toFixed(1)}%
                              </span>
                              <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem" }}>
                                {cat.renderedCount}/{cat.productCount}
                              </span>
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: "6px",
                                background: "var(--bg-subtle)",
                                borderRadius: "var(--radius-full)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: cat.renderedCount > 0 ? `${Math.max(2, cat.coveragePercent)}%` : `${relativeWidth * 0.15}%`,
                                  height: "100%",
                                  background: cat.renderedCount > 0 ? "var(--teal)" : "var(--line)",
                                  borderRadius: "var(--radius-full)",
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <Link
                            href={`/?category=${encodeURIComponent(cat.productType)}`}
                            className="btn"
                            style={{
                              padding: "4px 10px",
                              fontSize: "var(--text-xs)",
                              background: cat.renderedCount === 0 ? "var(--brand-primary-subtle)" : "var(--bg-surface)",
                              color: cat.renderedCount === 0 ? "var(--brand-primary)" : "var(--ink-secondary)",
                              borderColor: cat.renderedCount === 0 ? "var(--brand-primary-border)" : "var(--line)",
                              fontWeight: 600,
                            }}
                          >
                            Tạo Video
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 5. Action Callout Box */}
      <section
        aria-label="Kêu gọi hành động: Tạo thêm video cho danh mục chưa khai thác"
        style={{
          background: "linear-gradient(135deg, #4f46e5 0%, #2563eb 50%, #0d9488 100%)",
          borderRadius: "var(--radius-xl)",
          padding: "32px",
          color: "#ffffff",
          boxShadow: "var(--shadow-lg), 0 10px 30px rgba(79, 70, 229, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: "1 1 500px", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "12px",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399" }} />
            Cơ Hội Mở Rộng Tiếp Thị
          </div>
          <h3
            style={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.025em",
              margin: "0 0 8px",
            }}
          >
            Tạo thêm video cho danh mục chưa khai thác
          </h3>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.9)",
              fontSize: "var(--text-sm)",
              lineHeight: 1.6,
              maxWidth: "640px",
              margin: 0,
            }}
          >
            Hiện có hơn <strong>{metrics.stage4UniqueProductsUnrendered.toLocaleString("vi-VN")} sản phẩm</strong> chất lượng cao trong các danh mục <strong>Bàn phím cơ ({metrics.categories.find(c => c.productType === 'keyboard')?.productCount || 529} sp)</strong>, <strong>Card màn hình VGA ({metrics.categories.find(c => c.productType === 'gpu')?.productCount || 464} sp)</strong>, <strong>Tản nhiệt PC ({metrics.categories.find(c => c.productType === 'cooling')?.productCount || 318} sp)</strong> và <strong>Màn hình ({metrics.categories.find(c => c.productType === 'monitor')?.productCount || 309} sp)</strong> đang sẵn sàng để bạn tạo video viral tự động trong vòng 15 giây.
          </p>
        </div>

        <div style={{ zIndex: 1 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 24px",
              background: "#ffffff",
              color: "var(--ink-primary)",
              fontWeight: 800,
              fontSize: "var(--text-base)",
              borderRadius: "var(--radius-lg)",
              textDecoration: "none",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
              transition: "transform 0.18s ease, box-shadow 0.18s ease",
            }}
          >
            <span>Vào Studio Tạo Video Ngay</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default FunnelClient;
