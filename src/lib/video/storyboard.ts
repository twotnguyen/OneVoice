// SPDX-License-Identifier: Apache-2.0

import type { ProductSnapshot } from "../catalog/types";
import type { GeneratedProductContent } from "../content/types";
import type { VideoStoryboard } from "./types";

const COPY_LINE_LENGTH = 20;
const FACT_LINE_LENGTH = 24;

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

// Slice by Unicode code points rather than UTF-16 code units so a Vietnamese
// combining sequence or an astral-plane emoji is never cut mid-surrogate — which
// writeFile(..., "utf8") would otherwise emit as U+FFFD ("…").
function sliceCodePoints(value: string, maxCodePoints: number): string {
  return Array.from(value).slice(0, maxCodePoints).join("");
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function wrapText(
  value: string,
  maxLines: number,
  maxLineLength = COPY_LINE_LENGTH,
): string[] {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines: string[] = [];

  while (words.length > 0 && lines.length < maxLines) {
    let line = sliceCodePoints(words.shift()!, maxLineLength);
    while (
      words.length > 0 &&
      codePointLength(`${line} ${words[0]}`) <= maxLineLength
    ) {
      line += ` ${words.shift()!}`;
    }
    lines.push(line);
  }

  if (words.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = `${sliceCodePoints(lines.at(-1)!, maxLineLength - 1)}…`;
  }
  return lines;
}

function oneLine(value: string): string {
  return wrapText(value, 1, FACT_LINE_LENGTH)[0] ?? "";
}

function snapshotDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export function compileProductStoryboard(
  snapshot: ProductSnapshot,
  content: GeneratedProductContent,
): VideoStoryboard {
  const price = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(snapshot.priceVnd);
  const date = snapshot.collectedAt ? snapshotDate(snapshot.collectedAt) : null;
  const factLines = [
    ...wrapText(snapshot.name, 2),
    oneLine(price),
    ...(snapshot.sku ? [oneLine(`SKU: ${snapshot.sku}`)] : []),
    ...(date ? [oneLine(`Dữ liệu ngày ${date}`)] : []),
  ].slice(0, 5);

  return {
    schema: "onevoice.storyboard.v1",
    template: "product-spotlight-v1",
    canvas: { width: 1080, height: 1920, fps: 30, durationMs: 12_000 },
    scenes: [
      { kind: "hook", durationMs: 4_000, lines: wrapText(content.hook, 3) },
      { kind: "facts", durationMs: 4_000, lines: factLines },
      { kind: "cta", durationMs: 4_000, lines: wrapText(content.cta, 2) },
    ],
  };
}
