// SPDX-License-Identifier: Apache-2.0

import type { DayBucket } from "@/lib/stats/aggregations";

const WIDTH = 560;
const HEIGHT = 160;
const PAD = 8;

export function TrendChart({ trend }: Readonly<{ trend: readonly DayBucket[] }>) {
  const max = Math.max(1, ...trend.map((bucket) => bucket.count));
  const step = trend.length > 1 ? (WIDTH - PAD * 2) / (trend.length - 1) : 0;
  const points = trend.map((bucket, index) => ({
    x: PAD + index * step,
    y: HEIGHT - PAD - (bucket.count / max) * (HEIGHT - PAD * 2),
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const area = `${line} L${WIDTH - PAD},${HEIGHT - PAD} L${PAD},${HEIGHT - PAD} Z`;
  const summary = trend.map((bucket) => `${bucket.date}: ${bucket.count}`).join(", ");
  return (
    <figure className="card">
      <figcaption>Render mỗi ngày — 14 ngày gần nhất</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="trend-title trend-desc">
        <title id="trend-title">Biểu đồ render mỗi ngày</title>
        <desc id="trend-desc">{summary}</desc>
        <path d={area} fill="var(--cobalt)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--cobalt)" strokeWidth="2" />
      </svg>
    </figure>
  );
}
