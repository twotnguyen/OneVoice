// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { parseByteRange } from "./http-range";

describe("parseByteRange", () => {
  it("parses closed, open-ended, and suffix byte ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=1000-1001", 1000)).toBeNull();
  });

  it.each([
    ["bytes=100-99", 1000],
    ["bytes=-0", 1000],
    ["bytes=0-1,4-5", 1000],
    ["items=0-1", 1000],
    ["bytes= 0-1", 1000],
    ["bytes=0-a", 1000],
    ["bytes=0-1", 0],
    ["bytes=0-1", -1],
  ])("rejects malformed or unsatisfiable range %s", (header, size) => {
    expect(parseByteRange(header, size)).toBeNull();
  });

  it("clamps a valid range end and oversized suffix to the file", () => {
    expect(parseByteRange("bytes=900-1001", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-2000", 1000)).toEqual({ start: 0, end: 999 });
  });
});
