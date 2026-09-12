// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupabaseSettingsRepository } from "@/lib/business/settings-supabase";
import { SettingsForm } from "./settings-form";
import styles from "./settings.module.css";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const actor = await requirePagePermission("manage_ai", "/settings");
  const initial = await createSupabaseSettingsRepository(createSupabaseDataClient()).read(actor.organizationId);
  return <section className={styles.page}><header><h1>Cấu hình doanh nghiệp</h1><p>Thương hiệu, mục tiêu và thời gian đăng nội dung.</p><p><a href="/products">Quản lý sản phẩm →</a></p><p><a href="/knowledge">Chính sách và khuyến mãi →</a></p><p><a href="/settings/staff">Tài khoản nhân viên →</a></p><a href="/settings/audit">Xem nhật ký thay đổi →</a></header><SettingsForm initial={initial} /></section>;
}
