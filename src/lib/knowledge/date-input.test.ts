import { expect, it } from "vitest";
import { instantToInput, inputToInstant } from "./date-input";
import { isEffective } from "./management";
it("converts a picked time with an explicit offset across a UTC date boundary", () => {
  expect(inputToInstant("2026-09-12T00:30", 420)).toBe("2026-09-11T17:30:00.000Z");
  expect(inputToInstant("2026-09-12T23:30", -210)).toBe("2026-09-13T03:00:00.000Z");
});
it("changes displayed offset without changing the underlying instant, retaining milliseconds", () => {
  const instant = "2026-09-12T02:00:12.345Z";
  expect(instantToInput(instant, 420)).toBe("2026-09-12T09:00:12.345");
  expect(inputToInstant(instantToInput(instant, 345), 345)).toBe(instant);
});
it("supports unbounded endpoints and rejects impossible calendar dates", () => {
  expect(inputToInstant("", 420)).toBeNull();
  expect(instantToInput(null, 420)).toBe("");
  expect(() => inputToInstant("2026-02-30T09:00", 420)).toThrow();
});
it("keeps picked start inclusive and picked expiry exclusive", () => {
  const interval = { active: true, startsAt: inputToInstant("2026-09-12T09:00", 420), expiresAt: inputToInstant("2026-09-12T10:00", 420) };
  expect(isEffective(interval, new Date("2026-09-12T01:59:59.999Z"))).toBe(false);
  expect(isEffective(interval, new Date("2026-09-12T02:00:00Z"))).toBe(true);
  expect(isEffective(interval, new Date("2026-09-12T03:00:00Z"))).toBe(false);
});
