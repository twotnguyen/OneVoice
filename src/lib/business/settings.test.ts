import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema, createSettingsRepository } from "./settings";

describe("business settings", () => {
  it("has explicit revision zero defaults and independent modes", () => {
    expect(defaultSettings().revision).toBe(0);
    expect(settingsSchema.parse({ ...defaultSettings().settings, goalSelection: "manager", managerGoal: "Giới thiệu phụ kiện", timingMode: "auto" }).timingMode).toBe("auto");
  });
  it.each([{ timezone: "Wrong/Zone" }, { dailyCap: 0 }, { dailyCap: 31 }, { goalSelection: "manager", managerGoal: "" }, { token: "secret" }, { windows: [{ start: "18:00", end: "09:00" }] }, { windows: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] }])("rejects unsafe configuration %j", (override) => {
    expect(settingsSchema.safeParse({ ...defaultSettings().settings, ...override }).success).toBe(false);
  });
  it("reads new settings on each request instead of caching", async () => {
    let revision = 0;
    const repo = createSettingsRepository({ read: async () => ({ ...defaultSettings(), revision: revision++ }), save: async () => defaultSettings() });
    expect((await repo.read("org")).revision).toBe(0);
    expect((await repo.read("org")).revision).toBe(1);
  });
  it("returns explicit defaults for a missing settings record", async () => {
    const repo = createSettingsRepository({ read: async () => null, save: async () => defaultSettings() });
    expect(await repo.read("org")).toEqual(defaultSettings());
  });
  it("canonicalizes case-insensitive IANA names before persistence", () => {
    expect(settingsSchema.parse({ ...defaultSettings().settings, timezone: "asia/ho_chi_minh" }).timezone).toBe(new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh" }).resolvedOptions().timeZone);
  });
  it("rejects an overlapping allowed and forbidden topic", () => {
    expect(settingsSchema.safeParse({ ...defaultSettings().settings, allowedTopics: ["Phụ kiện"], forbiddenTopics: ["phụ KIỆN"] }).success).toBe(false);
  });
});
