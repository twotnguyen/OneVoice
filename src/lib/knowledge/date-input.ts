// SPDX-License-Identifier: Apache-2.0
/** Fixed offsets are explicit display choices; changing one never mutates an instant. */
export function instantToInput(instant: string | null, offsetMinutes: number): string {
  if (!instant) return "";
  return new Date(Date.parse(instant) + offsetMinutes * 60_000).toISOString().slice(0, -1);
}
export function inputToInstant(value: string, offsetMinutes: number): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) throw Error("Ngày giờ không hợp lệ.");
  const wallTime = new Date(value + "Z");
  if (!Number.isFinite(wallTime.getTime()) || wallTime.toISOString().slice(0, 16) !== value.slice(0, 16)) throw Error("Ngày giờ không hợp lệ.");
  return new Date(wallTime.getTime() - offsetMinutes * 60_000).toISOString();
}
export const dateOffsets = Array.from({ length: 105 }, (_, index) => -720 + index * 15);
export function offsetLabel(minutes: number): string {
  return `UTC${minutes < 0 ? "−" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}
