import { describe, expect, it } from "vitest";
import { normalizeJobError, referencePayload } from "./types";

describe("business job boundaries", () => {
  it("never persists raw thrown secrets", () => {
    expect(normalizeJobError(new Error("Bearer secret customer body"))).toBe("handler_failed");
  });
  it("rejects raw content and accepts only a UUID entity reference", () => {
    expect(referencePayload.safeParse({ entityId: "secret", body: "chat" }).success).toBe(false);
    expect(referencePayload.safeParse({ entityId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
});
