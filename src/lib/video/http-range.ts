// SPDX-License-Identifier: Apache-2.0

export type ByteRange = Readonly<{ start: number; end: number }>;

export function parseByteRange(header: string, size: number): ByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start >= size) return null;
  if (!match[2]) return { start, end: size - 1 };

  const requestedEnd = Number(match[2]);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}
