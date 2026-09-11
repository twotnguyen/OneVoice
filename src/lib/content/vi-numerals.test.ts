// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { formatVietnameseNumber, parseVietnameseNumber } from "./vi-numerals";

function values(text: string): number[] {
  return parseVietnameseNumber(text).map((p) => p.value);
}

describe("vi-numerals", () => {
  it("parses the spec AC price spelling", () => {
    expect(values("chỉ hai mươi lăm triệu đồng")).toEqual([25_000_000]);
  });

  it("parses scale words, fillers, and variants", () => {
    expect(values("một tỷ hai trăm triệu")).toEqual([1_200_000_000]);
    expect(values("một nghìn linh năm")).toEqual([1005]);
    expect(values("một trăm lẻ năm")).toEqual([105]);
    expect(values("hai mươi mốt")).toEqual([21]);
    expect(values("mười lăm")).toEqual([15]);
    expect(values("năm mươi nhăm")).toEqual([55]);
    expect(values("một ngàn ba trăm")).toEqual([1300]);
    expect(values("hai rưỡi")).toEqual([2.5]);
  });

  it("ignores non-number prose", () => {
    expect(parseVietnameseNumber("xin chào tạm biệt")).toEqual([]);
    // "không" alone is prose; with a continuer it is a real zero.
    expect(parseVietnameseNumber("không gian yên tĩnh")).toEqual([]);
    expect(values("miễn phí không đồng cho đơn đầu")).toEqual([0]);
  });

  it("round-trips format → parse for a 40-value table", () => {
    const table = [
      1, 5, 9, 10, 11, 14, 15, 19, 20, 21, 25, 30, 40, 55, 98, 99, 100,
      101, 105, 110, 115, 121, 200, 999, 1000, 1005, 1100, 1500, 10_000,
      100_000, 200_000, 1_000_000, 1_500_000, 2_490_000, 25_000_000, 29_990_000,
      30_000_000, 42_990_000, 45_000_000, 1_000_000_000,
    ];
    expect(table).toHaveLength(40);
    for (const n of table) {
      expect(values(formatVietnameseNumber(n)), n.toString()).toEqual([n]);
    }
  });

  it("spells the headline price exactly", () => {
    expect(formatVietnameseNumber(29_990_000)).toBe(
      "hai mươi chín triệu chín trăm chín mươi nghìn",
    );
  });

  it("rejects non-integers", () => {
    expect(() => formatVietnameseNumber(2.5)).toThrow();
    expect(() => formatVietnameseNumber(-1)).toThrow();
  });
});
