// SPDX-License-Identifier: Apache-2.0

import type { DayBucket } from "@/lib/stats/aggregations";

const WIDTH = 560;
const HEIGHT = 180;
const PAD_X = 24;
const PAD_Y = 20;

export function TrendChart({ trend }: Readonly<{ trend: readonly DayBucket[] }>) {
  const totalInTrend = trend.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(1, ...trend.map((bucket) => bucket.count));
  const step = trend.length > 1 ? (WIDTH - PAD_X * 2) / (trend.length - 1) : 0;
  
  const points = trend.map((bucket, index) => ({
    x: PAD_X + index * step,
    y: HEIGHT - PAD_Y - (bucket.count / max) * (HEIGHT - PAD_Y * 2),
    count: bucket.count,
    date: bucket.date,
  }));
  
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${(WIDTH - PAD_X).toFixed(1)},${HEIGHT - PAD_Y} L${PAD_X},${HEIGHT - PAD_Y} Z`;
  const summary = trend.map((bucket) => `${bucket.date}: ${bucket.count}`).join(", ");

  const firstDate = trend[0]?.date ? trend[0].date.slice(5) : "";
  const lastDate = trend.at(-1)?.date ? trend.at(-1)!.date.slice(5) : "";

  return (
    <article className="card trend-chart-card" aria-labelledby="trend-heading">
      <div className="card-header-row">
        <div>
          <h2 id="trend-heading" className="card-title">Xu Hướng Sản Xuất Video</h2>
          <p className="card-subtitle">Thống kê khối lượng render 14 ngày gần nhất</p>
        </div>
        <span className="trend-total-badge">
          <strong>{totalInTrend}</strong> video đã tạo
        </span>
      </div>

      <div className="trend-chart-wrapper">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="trend-title trend-desc"
          className="trend-svg"
        >
          <title id="trend-title">Biểu đồ render mỗi ngày</title>
          <desc id="trend-desc">{summary}</desc>

          <defs>
            <linearGradient id="trend-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines */}
          <line x1={PAD_X} y1={PAD_Y} x2={WIDTH - PAD_X} y2={PAD_Y} stroke="var(--line)" strokeDasharray="3 3" />
          <line x1={PAD_X} y1={HEIGHT / 2} x2={WIDTH - PAD_X} y2={HEIGHT / 2} stroke="var(--line)" strokeDasharray="3 3" />
          <line x1={PAD_X} y1={HEIGHT - PAD_Y} x2={WIDTH - PAD_X} y2={HEIGHT - PAD_Y} stroke="var(--line)" />

          {/* Area Fill */}
          <path d={area} fill="url(#trend-gradient)" />

          {/* Trend Line */}
          <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data Points */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={pt.count > 0 ? "4" : "2"}
              fill={pt.count > 0 ? "#4f46e5" : "var(--line)"}
              stroke="#ffffff"
              strokeWidth={pt.count > 0 ? "2" : "1"}
            />
          ))}
        </svg>

        {/* Date Labels Axis */}
        <div className="trend-axis-labels">
          <span>{firstDate}</span>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.68rem" }}>14 ngày</span>
          <span>{lastDate}</span>
        </div>
      </div>
    </article>
  );
}
