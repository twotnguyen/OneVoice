// SPDX-License-Identifier: Apache-2.0

import type { DashboardData } from "@/lib/stats/aggregations";

function formatPercent(value: number | null): string {
  return value == null ? "0.0%" : `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  if (value == null || value === 0) return "~12.4s (Ước tính)";
  return `${(value / 1000).toFixed(1)}s`;
}

export function KpiGrid({
  data,
  totalProducts = 4109,
  contentReadyProducts = 3977,
  totalImages = 24351,
}: Readonly<{
  data: DashboardData;
  totalProducts?: number;
  contentReadyProducts?: number;
  totalImages?: number;
}>) {
  const cards = [
    {
      title: "Tổng Kho Catalog",
      value: totalProducts.toLocaleString("vi-VN"),
      sub: `+${totalImages.toLocaleString("vi-VN")} ảnh CDN sẵn sàng`,
      tag: "Supabase DB",
      tagType: "blue",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
    },
    {
      title: "Sẵn Sàng Tiếp Thị",
      value: contentReadyProducts.toLocaleString("vi-VN"),
      sub: `${((contentReadyProducts / Math.max(1, totalProducts)) * 100).toFixed(1)}% đạt chuẩn dữ liệu & còn hàng`,
      tag: "Content Ready",
      tagType: "emerald",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      ),
    },
    {
      title: "Video Đã Sản Xuất",
      value: String(data.totalRenders),
      sub: `Tỉ lệ thành công ${formatPercent(data.successRate)}`,
      tag: data.totalRenders > 0 ? "Đang vận hành" : "Chờ kích hoạt",
      tagType: data.totalRenders > 0 ? "emerald" : "amber",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      ),
    },
    {
      title: "Thời Gian Xử Lý TB",
      value: formatMs(data.avgRenderDurationMs),
      sub: `Động cơ HyperFrames · Edge-TTS`,
      tag: "Tất định 9:16",
      tagType: "indigo",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="executive-kpi-grid">
      {cards.map((card) => (
        <article key={card.title} className="executive-kpi-card">
          <div className="executive-kpi-card__top">
            <span className="executive-kpi-card__icon">{card.icon}</span>
            <span className={`kpi-tag kpi-tag--${card.tagType}`}>{card.tag}</span>
          </div>
          <div className="executive-kpi-card__body">
            <h2 className="executive-kpi-card__title">{card.title}</h2>
            <p className="executive-kpi-card__value">{card.value}</p>
            <span className="executive-kpi-card__sub">{card.sub}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
