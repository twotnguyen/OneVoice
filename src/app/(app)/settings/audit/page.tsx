// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupabaseAuditRepository } from "@/lib/audit/supabase";
import { auditLabel } from "@/lib/business/settings-audit";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; cursor?: string }> }) {
  const actor = await requirePagePermission("read_audit", "/settings/audit");
  const query = await searchParams;
  let result;
  try {
    if ((query.cursor?.length ?? 0) > 300) throw Error("INVALID_QUERY");
    const cursor = query.cursor ? JSON.parse(query.cursor) : undefined;
    result = await createSupabaseAuditRepository(createSupabaseDataClient()).list({ organization_id: actor.organizationId, limit: 30, action: query.action || undefined, cursor });
  } catch { return <section className={styles.page}><h1>Nhật ký thay đổi</h1><p>Không thể tải nhật ký. Kiểm tra bộ lọc hoặc thử lại.</p><a href="/settings/audit">Xóa bộ lọc</a></section>; }
  const next = new URLSearchParams();
  if (query.action) next.set("action", query.action);
  if (result.next_cursor) next.set("cursor", JSON.stringify(result.next_cursor));
  return <section className={styles.page}><h1>Nhật ký thay đổi</h1><p>Nhật ký chỉ đọc. Thời gian được lưu theo UTC; không hiển thị nội dung khách hàng hoặc thông tin đăng nhập.</p><a href="/settings">← Cấu hình doanh nghiệp</a>
    <form method="get" className={styles.filter}><label>Mã hành động (lọc nâng cao)<input name="action" defaultValue={query.action} placeholder="Để trống để xem tất cả" maxLength={64} /></label><button type="submit">Lọc</button></form>
    <p>Mã <code>business.settings_updated</code> lọc các lần cập nhật cấu hình doanh nghiệp.</p>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Thời gian (UTC)</th><th>Hành động</th><th>Đối tượng</th><th>Người thực hiện</th><th>Lý do</th></tr></thead><tbody>{result.events.map(event => <tr key={event.id}><td><time dateTime={event.created_at}>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(new Date(event.created_at))}</time></td><td>{auditLabel("action", event.action)}</td><td>{auditLabel("entity", event.entity_type)}<br /><small>{event.entity_id}</small></td><td>{event.actor_kind === "system" ? "Hệ thống" : <>Nhân viên<br /><small>{event.actor_id}</small></>}</td><td>{auditLabel("reason", event.reason)}</td></tr>)}</tbody></table></div>
    {result.events.length === 0 && <p>Chưa có sự kiện phù hợp.</p>}{result.next_cursor && <a href={`/settings/audit?${next}`}>Trang tiếp theo →</a>}
  </section>;
}
