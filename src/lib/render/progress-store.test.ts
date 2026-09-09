// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { RenderProgressStore } from "./progress-store";

describe("RenderProgressStore", () => {
  it("records actual stages and clears terminal operations", () => {
    const store = new RenderProgressStore();
    store.start("render-1");
    store.update("render-1", "generating_content");
    expect(store.get("render-1")).toEqual({ renderId: "render-1", status: "running", stage: "generating_content" });
    store.clear("render-1");
    expect(store.get("render-1")).toBeNull();
  });

  it("bounds retained operations by count and age", () => {
    let now = 0;
    const store = new RenderProgressStore({ maxEntries: 2, maxAgeMs: 100, now: () => now });
    store.start("old");
    now = 50;
    store.start("middle");
    store.start("new");
    expect(store.get("old")).toBeNull();
    now = 151;
    expect(store.get("middle")).toBeNull();
  });
});
