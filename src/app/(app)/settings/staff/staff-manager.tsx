// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffPage, StaffRecord } from "@/lib/auth/staff-admin";
import styles from "./staff.module.css";
export function StaffManager({ initial, actorId }: { initial: StaffPage; actorId: string }) {
 const router = useRouter();
 const [list, setList] = useState(initial); const [editor, setEditor] = useState<StaffRecord | null>(null);
 const [creating, setCreating] = useState(false); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
 const [recoveryId, setRecoveryId] = useState<string | null>(null);
 const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
 const retry = useRef<{ body: string; requestId: string } | null>(null);
 async function reload(page = list.page) {
  const response = await fetch(`/api/staff?page=${page}`); if (!response.ok) throw Error("Không tải được danh sách. Kiểm tra quyền truy cập."); setList(await response.json());
 }
 function choose(person: StaffRecord) { setEditor(person); setCreating(false); setRecoveryId(null); setPassword(""); setEmail(""); retry.current = null; setMessage(""); }
 async function save() {
  if (!editor || busy) return;
  const base = creating ? { action: "create", email, password, displayName: editor.display_name, role: editor.role } : { action: "update", userId: editor.user_id, expectedVersion: editor.version, displayName: editor.display_name, role: editor.role, active: editor.active };
  const body = JSON.stringify(base); if (retry.current?.body !== body) retry.current = { body, requestId: recoveryId ?? crypto.randomUUID() };
  setBusy(true); setMessage("");
  try {
   const response = await fetch("/api/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, requestId: retry.current.requestId }) });
   if (!response.ok) { const result = await response.json(); throw Error(result.error === "LAST_MANAGER" ? "Cần giữ ít nhất một người quản lý đang hoạt động." : result.error === "CONFLICT" ? "Dữ liệu đã thay đổi. Bản nháp được giữ; tải lại danh sách và chọn tài khoản trước khi sửa tiếp." : result.error === "INVALID" ? "Kiểm tra email, tên và mật khẩu từ 12 đến 128 ký tự." : "Chưa xác nhận được kết quả. Giữ nguyên thông tin và bấm Lưu để thử lại cùng yêu cầu; tài khoản chưa hoàn tất không có quyền nội bộ."); }
   const result = await response.json();
   setPassword(""); retry.current = null; setRecoveryId(null); setCreating(false); setEditor({ ...editor, user_id: result.userId, version: result.version });
   setMessage("Đã lưu tài khoản. Thay đổi quyền áp dụng từ yêu cầu tiếp theo.");
   if (editor.user_id === actorId && (!editor.active || editor.role !== "manager")) { router.replace("/catalog"); router.refresh(); return; }
   await reload();
  } catch(error) { setMessage((error as Error).message); } finally { setBusy(false); }
 }
 return <section className={styles.page}><header><h1>Tài khoản nhân viên</h1><p>Cấp tài khoản, thay vai trò và khóa quyền truy cập nội bộ.</p><a href="/settings">← Cấu hình doanh nghiệp</a></header>
 {message && <p role="status" className={styles.notice}>{message}</p>}
 <div className={styles.actions}><button disabled={busy} onClick={() => { setCreating(true); setRecoveryId(null); setEmail(""); setPassword(""); retry.current = null; setMessage(""); setEditor({ user_id: "", display_name: "", role: "staff", active: true, version: 0 }); }}>Thêm nhân viên</button><button disabled={busy} onClick={() => void reload().catch(error => setMessage(error.message))}>Tải lại danh sách</button></div>
 {list.pending.length > 0 && <section className={styles.notice}><h2>Yêu cầu tạo chưa hoàn tất của bạn</h2><p>Tối đa 20 yêu cầu gần nhất. Chọn để thử lại với mật khẩu ban đầu; các yêu cầu này chưa cấp quyền nội bộ.</p>{list.pending.map(item => <button key={item.requestId} disabled={busy} onClick={() => { setCreating(true); setRecoveryId(item.requestId); retry.current = null; setEmail(item.email); setPassword(""); setEditor({ user_id: "", display_name: item.displayName, role: item.role, active: true, version: 0 }); setMessage("Nhập lại mật khẩu ban đầu để hoàn tất cùng yêu cầu."); }}>{item.displayName} · {item.email}</button>)}</section>}
 <div className={styles.columns}><section className={styles.card}><p>{list.total} tài khoản · Trang {list.page}</p>{list.items.map(person => <button disabled={busy} className={styles.person} key={person.user_id} onClick={() => choose(person)}><strong>{person.display_name || "Chưa đặt tên"}{person.user_id === actorId ? " (bạn)" : ""}</strong><span>{person.role === "manager" ? "Người quản lý" : "Nhân viên"} · {person.active ? "Đang hoạt động" : "Đã khóa"}</span></button>)}<div className={styles.actions}><button disabled={busy || list.page <= 1} onClick={() => void reload(list.page - 1).catch(error => setMessage(error.message))}>Trước</button><button disabled={busy || list.page * list.pageSize >= list.total} onClick={() => void reload(list.page + 1).catch(error => setMessage(error.message))}>Sau</button></div></section>
 <section className={styles.card}>{editor ? <form onSubmit={event => { event.preventDefault(); void save(); }}><h2>{creating ? "Thêm tài khoản" : "Chỉnh sửa tài khoản"}</h2><fieldset disabled={busy}>
 <label>Tên hiển thị<input required maxLength={160} value={editor.display_name} onChange={event => setEditor({ ...editor, display_name: event.target.value })} /></label>
 {creating && <><label>Email đăng nhập<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Mật khẩu ban đầu<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><p>Không gửi email tự động. Người quản lý chuyển thông tin đăng nhập qua kênh riêng phù hợp.</p></>}
 <label>Vai trò<select value={editor.role} onChange={event => setEditor({ ...editor, role: event.target.value as StaffRecord["role"] })}><option value="staff">Nhân viên · xử lý hỗ trợ và đơn hàng</option><option value="manager">Người quản lý · cấu hình và cấp quyền</option></select></label>
 {!creating && <label className={styles.check}><input type="checkbox" checked={editor.active} onChange={event => setEditor({ ...editor, active: event.target.checked })} />Đang hoạt động · bỏ chọn để khóa</label>}
 </fieldset><button type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu tài khoản"}</button></form> : <p>Chọn tài khoản để xem hoặc thêm nhân viên.</p>}</section></div></section>;
}
