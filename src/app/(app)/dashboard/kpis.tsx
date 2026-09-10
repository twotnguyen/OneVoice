// SPDX-License-Identifier: Apache-2.0

import type { DashboardData } from "@/lib/stats/aggregations";

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString("vi-VN")} ms`;
}

export function KpiGrid({ data }: Readonly<{ data: DashboardData }>) {
  const cards = [
    { label: "Tổng số render", value: String(data.totalRenders) },
    { label: "Tỉ lệ thành công", value: formatPercent(data.successRate) },
    { label: "Thời gian render TB", value: formatMs(data.avgRenderDurationMs) },
    {
      label: "Sản phẩm có video / sẵn sàng",
      value:
        data.coverage == null
          ? "—"
          : `${data.coverage.productsWithVideo} / ${data.coverage.contentReadyTotal}`,
    },
    {
      label: "Tổng token AI",
      value: data.aiTokens == null ? "—" : data.aiTokens.total.toLocaleString("vi-VN"),
    },
  ];
  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <article key={card.label} className="kpi">
          <h2>{card.label}</h2>
          <p>{card.value}</p>
        </article>
      ))}
    </div>
  );
}
