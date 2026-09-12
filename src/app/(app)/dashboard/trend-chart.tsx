// SPDX-License-Identifier: Apache-2.0
"use client";

import { useId, useMemo, useState } from "react";
import type { DayBucket } from "@/lib/stats/aggregations";

const WIDTH = 580;
const HEIGHT = 200;
const PAD_LEFT = 38;
const PAD_RIGHT = 24;
const PAD_TOP = 26;
const PAD_BOTTOM = 28;

type Point = {
  x: number;
  y: number;
  count: number;
  date: string;
};

/**
 * Fritsch-Carlson Monotone Cubic Spline interpolation.
 * Produces an organic, smooth Bezier curve while strictly avoiding overshoot
 * or artificial oscillation on flat segments (e.g. consecutive zeroes).
 */
function getMonotoneSplinePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  const n = points.length;
  const deltas: number[] = [];
  const dxs: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    dxs.push(dx);
    deltas.push(dx === 0 ? 0 : dy / dx);
  }

  const slopes: number[] = new Array(n);
  slopes[0] = deltas[0];
  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      slopes[i] = 0;
    } else {
      slopes[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }
  slopes[n - 1] = deltas[n - 2];

  for (let i = 0; i < n - 1; i++) {
    if (deltas[i] === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const alpha = slopes[i] / deltas[i];
      const beta = slopes[i + 1] / deltas[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        slopes[i] = tau * alpha * deltas[i];
        slopes[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = dxs[i];
    const cp1x = p0.x + dx / 3;
    const cp1y = p0.y + (slopes[i] * dx) / 3;
    const cp2x = p1.x - dx / 3;
    const cp2y = p1.y - (slopes[i + 1] * dx) / 3;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }

  return path;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

export function TrendChart({ trend }: Readonly<{ trend: readonly DayBucket[] }>) {
  const gradientId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const totalInTrend = useMemo(() => trend.reduce((sum, b) => sum + b.count, 0), [trend]);
  const max = useMemo(() => Math.max(1, ...trend.map((bucket) => bucket.count)), [trend]);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + plotHeight;
  const midY = PAD_TOP + plotHeight / 2;

  const points: readonly Point[] = useMemo(() => {
    if (trend.length === 0) return [];
    const step = trend.length > 1 ? plotWidth / (trend.length - 1) : 0;
    return trend.map((bucket, index) => ({
      x: PAD_LEFT + index * step,
      y: baselineY - (bucket.count / max) * plotHeight,
      count: bucket.count,
      date: bucket.date,
    }));
  }, [trend, plotWidth, plotHeight, baselineY, max]);

  const linePath = useMemo(() => getMonotoneSplinePath(points), [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return "";
    const lastX = points[points.length - 1].x.toFixed(1);
    const firstX = points[0].x.toFixed(1);
    return `${linePath} L${lastX},${baselineY} L${firstX},${baselineY} Z`;
  }, [linePath, points, baselineY]);

  const summary = useMemo(
    () => trend.map((bucket) => `${bucket.date}: ${bucket.count}`).join(", "),
    [trend]
  );

  const firstDate = trend[0]?.date ? formatDateDisplay(trend[0].date) : "";
  const midDate = trend[Math.floor(trend.length / 2)]?.date
    ? formatDateDisplay(trend[Math.floor(trend.length / 2)].date)
    : "";
  const lastDate = trend.at(-1)?.date ? formatDateDisplay(trend.at(-1)!.date) : "";

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closestIdx = 0;
    let minDist = Infinity;
    points.forEach((pt, i) => {
      const dist = Math.abs(pt.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });
    setHoveredIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <article className="card trend-chart-card" aria-labelledby="trend-heading">
      <div className="card-header-row">
        <div>
          <h2 id="trend-heading" className="card-title">Xu Hướng Sản Xuất Video</h2>
          <p className="card-subtitle">Thống kê khối lượng render 14 ngày gần nhất</p>
        </div>
        <div className="trend-badges-group">
          {max > 1 && (
            <span className="trend-peak-badge" title={`Ngày cao điểm nhất: ${max} video`}>
              Đỉnh: <strong>{max}</strong>/ngày
            </span>
          )}
          <span className="trend-total-badge">
            <strong>{totalInTrend}</strong> video đã tạo
          </span>
        </div>
      </div>

      <div className="trend-chart-wrapper">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="trend-title trend-desc"
          className="trend-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <title id="trend-title">Biểu đồ render mỗi ngày</title>
          <desc id="trend-desc">{summary}</desc>

          <defs>
            {/* Smooth glowing area gradient */}
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.32" />
              <stop offset="45%" stopColor="#6366f1" stopOpacity="0.14" />
              <stop offset="85%" stopColor="#818cf8" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
            </linearGradient>

            {/* Subtle multi-tone line gradient */}
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="60%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>

            {/* Ambient drop shadow glow for the curve */}
            <filter id={`${gradientId}-glow`} x="-10%" y="-30%" width="120%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="4.5" floodColor="#4f46e5" floodOpacity="0.30" />
            </filter>
          </defs>

          {/* Y-Axis Value Labels */}
          <text x={PAD_LEFT - 8} y={PAD_TOP + 3} className="trend-grid-label" textAnchor="end">
            {max}
          </text>
          <text x={PAD_LEFT - 8} y={midY + 3} className="trend-grid-label" textAnchor="end">
            {Math.round(max / 2)}
          </text>
          <text x={PAD_LEFT - 8} y={baselineY + 3} className="trend-grid-label" textAnchor="end">
            0
          </text>

          {/* Background Grid Lines */}
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={WIDTH - PAD_RIGHT}
            y2={PAD_TOP}
            stroke="var(--line)"
            strokeDasharray="4 4"
            strokeOpacity="0.75"
          />
          <line
            x1={PAD_LEFT}
            y1={midY}
            x2={WIDTH - PAD_RIGHT}
            y2={midY}
            stroke="var(--line)"
            strokeDasharray="4 4"
            strokeOpacity="0.75"
          />
          <line
            x1={PAD_LEFT}
            y1={baselineY}
            x2={WIDTH - PAD_RIGHT}
            y2={baselineY}
            stroke="var(--line)"
            strokeWidth="1.2"
          />

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId}-area)`} />}

          {/* Smooth Spline Trend Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={`url(#${gradientId}-line)`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${gradientId}-glow)`}
            />
          )}

          {/* Data Points */}
          {points.map((pt, i) => {
            const isHovered = hoveredIndex === i;
            const isPeak = pt.count === max && pt.count > 0;

            if (pt.count === 0) {
              return (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r="1.75"
                  fill="var(--line)"
                  opacity="0.6"
                />
              );
            }

            return (
              <g key={i} className="trend-point-group">
                {/* Outer halo */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "10" : isPeak ? "7.5" : "5.5"}
                  fill="#4f46e5"
                  opacity={isHovered ? "0.28" : isPeak ? "0.22" : "0.14"}
                  className="trend-point-halo"
                />
                {/* Core dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "4.5" : isPeak ? "4" : "3.5"}
                  fill="#ffffff"
                  stroke="#4f46e5"
                  strokeWidth="2.4"
                />
              </g>
            );
          })}

          {/* Hover Crosshair and Tooltip */}
          {activePoint && (
            <g className="trend-hover-indicator" pointerEvents="none">
              {/* Vertical guideline */}
              <line
                x1={activePoint.x}
                y1={PAD_TOP - 4}
                x2={activePoint.x}
                y2={baselineY}
                stroke="#6366f1"
                strokeDasharray="3 3"
                strokeWidth="1.5"
                opacity="0.8"
              />

              {/* Floating Tooltip Pill */}
              {(() => {
                const tooltipW = 96;
                const tooltipH = 26;
                let tx = activePoint.x - tooltipW / 2;
                if (tx < PAD_LEFT) tx = PAD_LEFT;
                if (tx + tooltipW > WIDTH - PAD_RIGHT) tx = WIDTH - PAD_RIGHT - tooltipW;
                const ty = Math.max(PAD_TOP - 20, activePoint.y - tooltipH - 10);

                return (
                  <g transform={`translate(${tx}, ${ty})`}>
                    <rect
                      width={tooltipW}
                      height={tooltipH}
                      rx="6"
                      fill="#0f172a"
                      opacity="0.92"
                    />
                    <text
                      x={tooltipW / 2}
                      y={tooltipH / 2 + 3.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="var(--font-sans)"
                    >
                      {formatDateDisplay(activePoint.date)}: {activePoint.count} video
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>

        {/* Date Labels Axis */}
        <div className="trend-axis-labels">
          <span>{firstDate}</span>
          {midDate && <span className="trend-axis-mid">{midDate}</span>}
          <span>{lastDate} (Hôm nay)</span>
        </div>
      </div>
    </article>
  );
}
