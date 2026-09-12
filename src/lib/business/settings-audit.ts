// SPDX-License-Identifier: Apache-2.0
const labels: Record<"action" | "entity" | "reason", Record<string, string>> = {
  action: { "business.settings_updated": "Cập nhật cấu hình doanh nghiệp" },
  entity: { business_settings: "Cấu hình doanh nghiệp" },
  reason: { manager_update: "Người quản lý cập nhật cấu hình" },
};
export function auditLabel(kind: keyof typeof labels, code: string): string {
  return Object.hasOwn(labels[kind], code) ? labels[kind][code] : code;
}
