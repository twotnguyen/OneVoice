// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const topics = z.array(z.string().trim().min(1).max(120)).max(30);
export const settingsSchema = z.strictObject({
  brandName: z.string().trim().min(1).max(120),
  brandVoice: z.string().trim().min(1).max(2000),
  allowedTopics: topics, forbiddenTopics: topics,
  timezone: z.string().max(80).regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Múi giờ IANA không hợp lệ").transform(value => new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone),
  goalSelection: z.enum(["auto", "manager"]), managerGoal: z.string().trim().max(1000),
  timingMode: z.enum(["auto", "constrained"]), dailyCap: z.number().int().min(1).max(30),
  windows: z.array(z.strictObject({ start: clock, end: clock })).min(1).max(7),
  objective: z.enum(["engagement", "messages", "paid-orders", "mixed"]),
}).superRefine((value, ctx) => {
  if (value.allowedTopics.some(topic => value.forbiddenTopics.some(forbidden => forbidden.toLowerCase() === topic.toLowerCase()))) ctx.addIssue({ code: "custom", path: ["forbiddenTopics"], message: "Một chủ đề không thể vừa được phép vừa bị cấm" });
  if (value.goalSelection === "manager" && !value.managerGoal) ctx.addIssue({ code: "custom", path: ["managerGoal"], message: "Nhập mục tiêu do người quản lý chỉ định" });
  const sorted = [...value.windows].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.some((window, i) => window.start >= window.end || (i > 0 && sorted[i - 1].end > window.start))) ctx.addIssue({ code: "custom", path: ["windows"], message: "Khung giờ phải tăng dần, không chồng lấn hoặc qua nửa đêm" });
});
export type BusinessSettings = z.infer<typeof settingsSchema>;
export const settingsSnapshotSchema = z.strictObject({ revision: z.number().int().nonnegative(), settings: settingsSchema });
export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
export const settingsSaveSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), requestId: z.string().uuid(), settings: settingsSchema });
export type SettingsSave = z.infer<typeof settingsSaveSchema>;
export class SettingsConflict extends Error { constructor() { super("SETTINGS_CONFLICT"); } }
export function defaultSettings(): SettingsSnapshot {
  return { revision: 0, settings: { brandName: "OneVoice", brandVoice: "Rõ ràng, lịch sự, tư vấn dựa trên dữ liệu doanh nghiệp.", allowedTopics: [], forbiddenTopics: [], timezone: "Asia/Ho_Chi_Minh", goalSelection: "auto", managerGoal: "", timingMode: "constrained", dailyCap: 1, windows: [{ start: "09:00", end: "17:00" }], objective: "mixed" } };
}
export type SettingsPort = { read(organizationId: string): Promise<SettingsSnapshot | null>; save(organizationId: string, actorId: string, input: SettingsSave): Promise<SettingsSnapshot> };
/** Runtime consumers must call read for every decision; no process-wide cache.
 * This repository never controls RUNNING/PAUSED or schedules/publishes anything.
 */
export function createSettingsRepository(port: SettingsPort) {
  return {
    async read(organizationId: string) { const value = await port.read(organizationId); return value ? settingsSnapshotSchema.parse(value) : defaultSettings(); },
    async save(organizationId: string, actorId: string, input: SettingsSave) { return settingsSnapshotSchema.parse(await port.save(organizationId, actorId, settingsSaveSchema.parse(input))); },
  };
}
