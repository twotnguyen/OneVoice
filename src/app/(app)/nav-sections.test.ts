// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { isActiveSection, NAV_SECTIONS } from "./nav-sections";

describe("isActiveSection", () => {
  it("matches exact paths", () => {
    expect(isActiveSection("/dashboard", "/dashboard")).toBe(true);
    expect(isActiveSection("/", "/")).toBe(true);
  });

  it("matches nested paths under a section", () => {
    expect(isActiveSection("/dashboard/x", "/dashboard")).toBe(true);
  });

  it("does not match sibling prefixes or root-vs-subpath", () => {
    expect(isActiveSection("/dashboard-x", "/dashboard")).toBe(false);
    expect(isActiveSection("/dashboard", "/")).toBe(false);
    expect(isActiveSection("/", "/dashboard")).toBe(false);
  });

  it("works for disabled entries without caring about status", () => {
    expect(isActiveSection("/history", "/history")).toBe(true);
  });
});

describe("NAV_SECTIONS", () => {
  it("orders navigation sections starting with dashboard", () => {
    expect(NAV_SECTIONS.map((entry) => entry.href)).toEqual([
      "/dashboard",
      "/",
      "/catalog",
      "/history",
      "/funnel",
    ]);
    expect(NAV_SECTIONS.every((entry) => entry.status === "active")).toBe(true);
  });
});
