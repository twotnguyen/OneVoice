// SPDX-License-Identifier: Apache-2.0
// Truth-guard: every numeric/spec claim in a script must trace to the snapshot.
// voiceText spells numbers out, inputs keep digit form — both normalise to
// { value, unit } before comparison. Empty result === clean.

import type { ProductSnapshot } from "../catalog/types";
import type { ProductScript } from "../video/script-schema";
import { parseVietnameseNumber } from "./vi-numerals";

export type TruthViolation = Readonly<{
  sceneId: string;
  field: "voiceText" | `inputs.${string}`;
  claim: string;
  normalized: string;
  reason: "UNKNOWN_NUMERIC" | "UNKNOWN_SPEC" | "UNREFERENCED_FACT";
}>;

type Claim = Readonly<{
  text: string;
  value: number;
  unit: string | null;
}>;

function lower(word: string): string {
  return word.toLowerCase();
}

// Units that mark a claim as a spec rather than a bare number. Money units stay
// numeric so a wrong price reports UNKNOWN_NUMERIC.
const SPEC_UNITS = new Set([
  "percent",
  "gb",
  "tb",
  "mb",
  "inch",
  "hz",
  "mah",
  "w",
  "kg",
  "hour",
  "minute",
]);

// Words before/after a number that make it prose, not a claim: ordinals,
// dates, scene counts, second-durations, durations ("giây" is never a spec).
const IGNORE_PREV = new Set(["thứ", "ngày", "tháng", "năm"]);
const IGNORE_NEXT = new Set([
  "cách",
  "bước",
  "điều",
  "mẹo",
  "lưu",
  "giây",
  "s",
  "đầu",
  "cảnh",
  "canh",
]);

function isIgnored(text: string, start: number, end: number): boolean {
  const prev = [...text.slice(0, start).matchAll(/[\p{L}]+/gu)].at(-1)?.[0] ?? "";
  if (IGNORE_PREV.has(lower(prev))) return true;
  const next = [...text.slice(end, end + 24).matchAll(/[\p{L}]+/gu)].map((m) => m[0]);
  const [a, b] = next.map(lower);
  if (a === "lý" || a === "li") return b === "do";
  if (a && IGNORE_NEXT.has(a)) return true;
  return false;
}

function captureUnit(text: string, end: number): string | null {
  const rest = text.slice(end, end + 24);
  const words = [...rest.matchAll(/[%₫"]|[\p{L}]+/gu)].map((m) => m[0]);
  const [a, b] = words.map(lower);
  if (!a) return null;
  if (a === "%" || (a === "phần" && b === "trăm")) return "percent";
  if (a === "₫" || a === "đồng" || a === "vnd" || a === "d") return "vnd";
  if (a === "gb" || a === "giga" || a === "gigabyte" || a === "ram") return "gb";
  if (a === "gi" && b === "ga") {
    // hyphenated "gi-ga bờ ram" spelling of gigabyte
    return "gb";
  }
  if (a === "tb") return "tb";
  if (a === "mb") return "mb";
  if (a === "inch") return "inch";
  if (a === "hz") return "hz";
  if (a === "mah") return "mah";
  if (a === "kg") return "kg";
  if (a === "w") return "w";
  if (a === "giờ" || a === "tiếng") return "hour";
  if (a === "phút") return "minute";
  return null;
}

function extractClaims(text: string): Claim[] {
  if (typeof text !== "string") return [];
  const masked = text.replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, (m) => " ".repeat(m.length));
  const out: Claim[] = [];
  const spans: Array<readonly [number, number]> = [];
  for (const parsed of parseVietnameseNumber(masked)) {
    const [start, end] = parsed.span;
    // Strip trailing unit words from the span; the unit is captured separately
    // so "chín mươi tám phần" claims 98, not "98 phần".
    const claimText = masked.slice(start, end).replace(/\s+(phần|đồng|giờ|tiếng|phút|giây|gb|ram|gi|ga|bờ)$/iu, "");
    const unitEnd = start + claimText.length;
    if (isIgnored(masked, start, unitEnd)) continue;
    const unit = captureUnit(masked, unitEnd);
    const bareEnd = unit ? unitEnd : end;
    if (isIgnored(masked, start, bareEnd)) continue;
    out.push({ text: claimText.trimEnd(), value: parsed.value, unit });
    spans.push([start, end] as const);
  }
  for (const match of masked.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (spans.some(([s, e]) => start < e && end > s)) continue;
    if (isIgnored(masked, start, end)) continue;
    const value = Number(match[0].replace(/[.,]/g, ""));
    if (!Number.isFinite(value)) continue;
    out.push({ text: match[0], value, unit: captureUnit(masked, end) });
  }
  // Mixed digit + scale-word prices ("29 triệu 990 nghìn"): the digit scanner
  // covers it directly; the word parser sees only the orphaned scale words.
  for (const match of masked.matchAll(/\d[\d.,]*\s+(?:triệu|tỷ|tỉ|nghìn|ngàn|trăm)(?:\s+\d[\d.,]*\s+(?:triệu|tỷ|tỉ|nghìn|ngàn|trăm))*/giu)) {
    const text0 = match[0];
    const start = match.index;
    const end = start + text0.length;
    const parts = text0.split(/\s+/);
    let value = 0;
    let ok = true;
    for (let k = 0; k < parts.length; k += 2) {
      const num = Number(parts[k].replace(/[.,]/g, ""));
      const scale = (parts[k + 1] ?? "").toLowerCase();
      const mult =
        scale === "tỷ" || scale === "tỉ"
          ? 1_000_000_000
          : scale === "triệu"
            ? 1_000_000
            : scale === "nghìn" || scale === "ngàn"
              ? 1_000
              : scale === "trăm"
                ? 100
                : NaN;
      if (!Number.isFinite(num) || !Number.isFinite(mult)) {
        ok = false;
        break;
      }
      value += num * mult;
    }
    if (!ok) continue;
    // Drop the per-digit claims covered by this composite.
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      const cs = masked.indexOf(c.text, start);
      if (cs >= start && cs + c.text.length <= end) out.splice(k, 1);
    }
    if (isIgnored(masked, start, end)) continue;
    out.push({ text: text0, value, unit: captureUnit(masked, end) });
  }
  return out;
}

// Allowed corpus: value -> unit -> fact refs ("*price*" / "*identity*" bypass
// the factRefs gate).
function buildCorpus(snapshot: ProductSnapshot): Map<number, Map<string, Set<string>>> {
  const corpus = new Map<number, Map<string, Set<string>>>();
  const add = (value: number, unit: string | null, ref: string) => {
    let byUnit = corpus.get(value);
    if (!byUnit) corpus.set(value, (byUnit = new Map()));
    const key = unit ?? "";
    let refs = byUnit.get(key);
    if (!refs) byUnit.set(key, (refs = new Set()));
    refs.add(ref);
  };
  add(snapshot.priceVnd, null, "*price*");
  add(snapshot.priceVnd, "vnd", "*price*");
  for (const source of [snapshot.name, snapshot.sku, snapshot.brand, snapshot.collectedAt]) {
    if (!source) continue;
    for (const claim of extractClaims(source)) add(claim.value, claim.unit, "*identity*");
  }
  for (const fact of snapshot.facts) {
    for (const claim of extractClaims(fact.value)) add(claim.value, claim.unit, fact.ref);
  }
  return corpus;
}

function matchRefs(
  corpus: Map<number, Map<string, Set<string>>>,
  claim: Claim,
): Set<string> | null {
  const byUnit = corpus.get(claim.value);
  if (!byUnit) return null;
  const refs = new Set<string>();
  for (const [unit, factRefs] of byUnit) {
    // A bare claim matches any unit; a unit-bearing claim needs its unit.
    if (claim.unit === null || claim.unit === unit) {
      for (const ref of factRefs) refs.add(ref);
    }
  }
  return refs.size > 0 ? refs : null;
}

function displayUnit(unit: string | null): string {
  if (unit === null) return "";
  if (unit === "percent") return "%";
  return unit.toUpperCase();
}

function toViolation(
  sceneId: string,
  field: TruthViolation["field"],
  claim: Claim,
  reason: TruthViolation["reason"],
): TruthViolation {
  return {
    sceneId,
    field,
    claim: claim.text,
    normalized: `${claim.value}|${displayUnit(claim.unit)}`,
    reason,
  };
}

function checkField(
  corpus: Map<number, Map<string, Set<string>>>,
  sceneId: string,
  field: TruthViolation["field"],
  text: string,
  factRefs: readonly string[],
): TruthViolation[] {
  const out: TruthViolation[] = [];
  for (const claim of extractClaims(text)) {
    const refs = matchRefs(corpus, claim);
    if (!refs) {
      out.push(
        toViolation(
          sceneId,
          field,
          claim,
          claim.unit !== null && SPEC_UNITS.has(claim.unit) ? "UNKNOWN_SPEC" : "UNKNOWN_NUMERIC",
        ),
      );
      continue;
    }
    const allowed =
      refs.has("*price*") || refs.has("*identity*") || factRefs.some((r) => refs.has(r));
    if (!allowed) {
      out.push(toViolation(sceneId, field, claim, "UNREFERENCED_FACT"));
    }
  }
  return out;
}

function stringLeaves(
  value: unknown,
  path: string,
  sink: Array<{ field: `inputs.${string}`; text: string }>,
): void {
  if (typeof value === "string") {
    sink.push({ field: `inputs.${path}`, text: value });
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    sink.push({ field: `inputs.${path}`, text: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => stringLeaves(item, `${path}.${i}`, sink));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      stringLeaves(item, path ? `${path}.${key}` : key, sink);
    }
  }
}

export function checkScriptAgainstSnapshot(
  script: ProductScript,
  snapshot: ProductSnapshot,
): readonly TruthViolation[] {
  const corpus = buildCorpus(snapshot);
  const out: TruthViolation[] = [];
  for (const scene of script.scenes) {
    out.push(...checkField(corpus, scene.id, "voiceText", scene.voiceText, scene.factRefs));
    const leaves: Array<{ field: `inputs.${string}`; text: string }> = [];
    stringLeaves(scene.inputs, "", leaves);
    for (const leaf of leaves) {
      out.push(...checkField(corpus, scene.id, leaf.field, leaf.text, scene.factRefs));
    }
  }
  return out;
}
