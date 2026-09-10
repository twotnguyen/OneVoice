// SPDX-License-Identifier: Apache-2.0
// Vietnamese number-word ↔ digit normaliser for the truth-guard.
// voiceText spells numbers out ("hai mươi chín triệu ..."), inputs keep
// digit form, so both sides normalise to plain numbers before comparison.
//
// ponytail: accented forms only. If unaccented model output is ever observed,
// add ASCII fallbacks for the unambiguous words (never "tam"/"nam"/"tram",
// which collide with "tạm"/"nam"/"trạm").

export type ParsedNumber = Readonly<{
  value: number;
  span: readonly [number, number];
}>;

// Raw-exact lookup: folded forms collide with prose ("tạm"→"tam" is not eight,
// "nam" is south, "sau" is after is handled by the caller's ignore-list).
const DIGITS: Record<string, number> = {
  "không": 0,
  "một": 1,
  "mốt": 1,
  hai: 2,
  ba: 3,
  "bốn": 4,
  "năm": 5,
  "sáu": 6,
  "bảy": 7,
  "tám": 8,
  "chín": 9,
  "lăm": 5,
  "nhăm": 5,
};

type Kind =
  | { tag: "digit"; value: number }
  | { tag: "ten" }
  | { tag: "tens" }
  | { tag: "hundred" }
  | { tag: "scale"; value: number }
  | { tag: "filler" }
  | { tag: "half" }
  | { tag: "unit" };

function classify(raw: string): Kind | null {
  const word = raw.toLowerCase();
  if (word in DIGITS) return { tag: "digit", value: DIGITS[word] };
  if (word === "mười") return { tag: "ten" };
  if (word === "mươi") return { tag: "tens" };
  if (word === "trăm") return { tag: "hundred" };
  if (word === "nghìn" || word === "ngàn") return { tag: "scale", value: 1_000 };
  if (word === "triệu") return { tag: "scale", value: 1_000_000 };
  if (word === "tỷ" || word === "tỉ") return { tag: "scale", value: 1_000_000_000 };
  if (word === "linh" || word === "lẻ") return { tag: "filler" };
  if (word === "rưỡi") return { tag: "half" };
  if (
    word === "đồng" ||
    word === "giờ" ||
    word === "phút" ||
    word === "giây" ||
    word === "phần" ||
    word === "gb" ||
    word === "ram" ||
    word === "gi" ||
    word === "ga" ||
    word === "bờ"
  ) {
    return { tag: "unit" };
  }
  return null;
}

type Word = Readonly<{ raw: string; start: number; end: number; kind: Kind }>;

function tokenize(text: string): Word[] {
  const out: Word[] = [];
  for (const match of text.matchAll(/[\p{L}]+/gu)) {
    const raw = match[0];
    const kind = classify(raw);
    if (kind) out.push({ raw, start: match.index, end: match.index + raw.length, kind });
  }
  return out;
}

function isRunStart(kind: Kind | undefined): boolean {
  return (
    kind?.tag === "digit" ||
    kind?.tag === "ten" ||
    kind?.tag === "hundred" ||
    kind?.tag === "scale" ||
    kind?.tag === "unit"
  );
}

// Parses one sub-thousand group ("một trăm linh năm"). Returns [value, nextIndex]
// or null when no group starts here.
function parseSmall(words: Word[], i: number): [number, number] | null {
  let value = 0;
  let j = i;
  const first = words[j]?.kind;
  if (first?.tag === "digit" && first.value === 0) {
    // A lone "không" is prose ("không gian"), not zero — it only counts with
    // a continuer ("không đồng" is free of charge).
    const next = words[j + 1]?.kind?.tag;
    if (
      next !== "hundred" &&
      next !== "ten" &&
      next !== "tens" &&
      next !== "scale" &&
      next !== "filler" &&
      next !== "unit"
    ) {
      return null;
    }
  }
  if (first?.tag === "digit" && words[j + 1]?.kind?.tag === "hundred") {
    value = first.value * 100;
    j += 2;
  } else if (first?.tag === "hundred") {
    // A bare "trăm" is the percent sign's second half ("phần trăm"), not 100 —
    // it only counts toward a scale ("trăm nghìn").
    const next = words[j + 1]?.kind?.tag;
    if (next !== "scale" && next !== "half") return null;
    value = 100;
    j += 1;
  }
  const rest = words[j]?.kind;
  if (rest?.tag === "ten") {
    value += 10;
    j += 1;
    const unit = words[j]?.kind;
    if (unit?.tag === "digit") {
      value += unit.value;
      j += 1;
    }
  } else if (rest?.tag === "digit" && words[j + 1]?.kind?.tag === "tens") {
    value += rest.value * 10;
    j += 2;
    const unit = words[j]?.kind;
    if (unit?.tag === "digit") {
      value += unit.value;
      j += 1;
    }
  } else if (rest?.tag === "digit") {
    // A bare digit only opens a group when nothing was consumed yet; otherwise
    // it starts a new run ("một hai" is 1 then 2, not 12).
    if (j !== i) return [value, j];
    value += rest.value;
    j += 1;
  } else if (rest?.tag === "filler") {
    j += 1;
    const unit = words[j]?.kind;
    if (unit?.tag === "digit") {
      value += unit.value;
      j += 1;
    }
  } else if (rest?.tag === "unit") {
    // Bare units are prose fragments ("đồng", "phút", "giây" alone) — the
    // caller merges them into a neighboring run, so they never end a span.
    return null;
  }
  return j === i ? null : [value, j];
}

export function parseVietnameseNumber(text: string): ParsedNumber[] {
  const words = tokenize(text);
  const out: ParsedNumber[] = [];
  let i = 0;
  while (i < words.length) {
    if (!isRunStart(words[i]?.kind)) {
      i += 1;
      continue;
    }
    if (words[i]?.kind?.tag === "unit") {
      i += 1; // unit words only extend spans via the capture below
      continue;
    }
    const start = words[i].start;
    let total = 0;
    let tail = 0;
    let consumed = false;
    for (;;) {
      const small = parseSmall(words, i);
      if (!small) break;
      consumed = true;
      const [group, next] = small;
      i = next;
      const tag = words[i]?.kind;
      if (tag?.tag === "scale") {
        total += (group === 0 ? 1 : group) * tag.value;
        tail = 0;
        i += 1;
        continue;
      }
      if (tag?.tag === "filler" && words[i + 1]?.kind?.tag === "digit") {
        i += 1; // skip "linh"/"lẻ"; the digit parses as the next group
        continue;
      }
      tail += group;
      break;
    }
    if (!consumed) {
      i += 1;
      continue;
    }
    let value = total + tail;
    let end = words[i - 1].end;
    // Trailing units extend the span only when they cannot start a longer run:
    // "triệu" after "29" continues the number, so leave it for the next group.
    while (words[i]?.kind?.tag === "unit" || words[i]?.kind?.tag === "half") {
      const nextTag = words[i + 1]?.kind?.tag;
      if (words[i]?.kind?.tag === "unit" && nextTag === "digit") break;
      if (words[i]?.kind?.tag === "half") value = value > 0 ? value + 0.5 : 1.5;
      end = words[i].end;
      i += 1;
    }
    out.push({ value, span: [start, end] as const });
  }
  return out;
}

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function formatBelowHundred(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return n === 10 ? "mười" : `mười ${n === 15 ? "lăm" : ONES[n - 10]}`;
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return `${ONES[tens]} mươi`;
  if (unit === 1) return `${ONES[tens]} mươi mốt`;
  if (unit === 5) return `${ONES[tens]} mươi lăm`;
  return `${ONES[tens]} mươi ${ONES[unit]}`;
}

function formatBelowThousand(n: number): string {
  if (n < 100) return formatBelowHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return `${ONES[hundreds]} trăm`;
  if (rest < 10) return `${ONES[hundreds]} trăm linh ${ONES[rest]}`;
  return `${ONES[hundreds]} trăm ${formatBelowHundred(rest)}`;
}

// Shows the model the exact spoken price it must use (reused by T6's prompt).
export function formatVietnameseNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`cannot spell non-integer: ${n}`);
  if (n < 1000) return formatBelowThousand(n);
  const parts: string[] = [];
  let rest = n;
  const scales: Array<[number, string]> = [
    [1_000_000_000, "tỷ"],
    [1_000_000, "triệu"],
    [1_000, "nghìn"],
  ];
  for (const [size, name] of scales) {
    const group = Math.floor(rest / size);
    if (group > 0) {
      parts.push(`${formatBelowThousand(group)} ${name}`);
      rest -= group * size;
    }
  }
  if (rest > 0) parts.push(formatBelowThousand(rest));
  return parts.join(" ");
}
