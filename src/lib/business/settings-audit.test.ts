import { expect, it } from "vitest";
import { auditLabel } from "./settings-audit";
it("shows meaningful Vietnamese names for settings audit events", () => {
  expect(auditLabel("action", "business.settings_updated")).toBe("Cập nhật cấu hình doanh nghiệp");
  expect(auditLabel("entity", "business_settings")).toBe("Cấu hình doanh nghiệp");
  expect(auditLabel("reason", "manager_update")).toBe("Người quản lý cập nhật cấu hình");
});
it("preserves unknown audit codes rather than inventing descriptions", () => {
  expect(auditLabel("action", "future.unknown")).toBe("future.unknown");
});
