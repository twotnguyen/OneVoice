// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import {
  fulfilmentLabels, nextFulfilmentStatus, operationalStatuses, transitionCommandSchema, type OperationalStatus,
  type PaymentException, type StaffOrderDetail, type StaffOrderPage,
} from "@/lib/orders/operations";
import styles from "./orders.module.css";

const money = (value: number | null) => value == null ? "Chưa có tổng" : `${value.toLocaleString("vi-VN")} ₫`;
const time = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const paidLabel: Record<string, string> = { PAID: "Đã thanh toán", UNPAID: "Chưa thanh toán", FAILED: "Thanh toán thất bại" };

export function OrdersManager({ initial, role, exceptions: starting }: { initial: StaffOrderPage; role: "manager" | "staff"; exceptions: PaymentException[] }) {
  const [page, setPage] = useState(initial);
  const [status, setStatus] = useState<OperationalStatus>("PREPARING");
  const [record, setRecord] = useState<StaffOrderDetail | null>(null);
  const [exceptions, setExceptions] = useState(starting);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackingRef, setTrackingRef] = useState("");
  const [customerVisibleProgress, setCustomerVisibleProgress] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const retry = useRef<{ serialized: string; requestId: string } | null>(null);

  async function request(url: string, init?: RequestInit) {
    const result = await fetch(url, { ...init, cache: "no-store" });
    if (!result.ok) throw Error(result.status === 409 ? "Đơn đã đổi ở phiên khác. Tải lại trước khi cập nhật tiếp." : result.status === 400 ? "Không thể lưu: kiểm tra bước giao hàng và đơn đã thanh toán." : result.status === 404 ? "Không tìm thấy đơn trong tổ chức này." : "Không thực hiện được. Kiểm tra phiên đăng nhập và thử lại.");
    return result.json();
  }
  async function run(work: () => Promise<void>) { setBusy(true); setNotice(""); try { await work(); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }
  async function load(next = status, number = 1) {
    setStatus(next);
    setPage(await request(`/api/orders?${new URLSearchParams({ status: next, page: String(number) })}`));
  }
  async function open(orderId: string) {
    const value: StaffOrderDetail = await request(`/api/orders/${orderId}`);
    setRecord(value);
    setTrackingRef(value.trackingRef ?? "");
    setCustomerVisibleProgress(value.customerVisibleProgress);
    setInternalNote(value.internalNote);
    retry.current = null;
  }
  async function save() {
    if (!record) return;
    const next = nextFulfilmentStatus(record.fulfilmentStatus);
    if (!next) return;
    const value = { expectedVersion: record.revision, to: next, trackingRef: trackingRef.trim() || null, customerVisibleProgress, internalNote };
    const serialized = JSON.stringify(value);
    if (retry.current?.serialized !== serialized) retry.current = { serialized, requestId: crypto.randomUUID() };
    const parsed = transitionCommandSchema.safeParse({ ...value, requestId: retry.current.requestId });
    if (!parsed.success) throw Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
    await request(`/api/orders/${record.orderId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
    await open(record.orderId);
    await load(next, page.page);
    setNotice("Đã lưu bước giao hàng. Ghi chú nội bộ chỉ dành cho nhân viên.");
  }
  async function acknowledge(exceptionId: string) {
    await request("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exceptionId, requestId: crypto.randomUUID() }) });
    setExceptions(await request("/api/orders?exceptions=true"));
    setNotice("Đã ghi nhận ngoại lệ. Hoàn tiền hoặc đối soát cổng thanh toán thực hiện ngoài OneVoice.");
  }

  const next = record ? nextFulfilmentStatus(record.fulfilmentStatus) : null;
  return <section className={styles.page}>
    <header>
      <h1>Đơn hàng</h1>
      <p>Danh sách chuẩn bị, đang giao và đã giao. Nhân viên chỉ cập nhật bước hợp lệ; không sửa giá, thanh toán hay chính sách tại đây.</p>
    </header>
    <nav className={styles.filters} aria-label="Lọc đơn hàng">
      {operationalStatuses.map((value) => (
        <button key={value} disabled={busy} aria-current={status === value ? "page" : undefined} onClick={() => void run(() => load(value))}>{fulfilmentLabels[value]}</button>
      ))}
      <button disabled={busy} onClick={() => void run(async () => { await load(status, page.page); if (record) await open(record.orderId); })}>Tải lại</button>
    </nav>
    {busy && <p role="status">Đang tải…</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.columns}>
      <aside>
        <p>{page.total} đơn · Trang {page.page}</p>
        {page.items.length === 0 && <p>Chưa có đơn trong bộ lọc này.</p>}
        {page.items.map((item) => (
          <button className={styles.ticket} key={item.orderId} disabled={busy} onClick={() => void run(() => open(item.orderId))}>
            <strong>{item.buyerName ?? "Chưa có tên khách"}</strong>
            <span>{fulfilmentLabels[item.fulfilmentStatus as OperationalStatus] ?? item.fulfilmentStatus} · {paidLabel[item.paymentStatus] ?? item.paymentStatus}</span>
            <small>{money(item.totalVnd)} · {time(item.updatedAt)} · Phiên bản {item.revision}</small>
          </button>
        ))}
        <div className={styles.toolbar}>
          <button disabled={busy || page.page <= 1} onClick={() => void run(() => load(status, page.page - 1))}>Trước</button>
          <button disabled={busy || page.page * 20 >= page.total} onClick={() => void run(() => load(status, page.page + 1))}>Sau</button>
        </div>
      </aside>
      <div>
        {record && <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); void run(save); }}>
          <h2>Chi tiết đơn …{record.orderId.slice(-8)}</h2>
          <p>{record.buyerName ?? "Chưa có tên khách"} · {record.phone ?? "Chưa có số điện thoại"}</p>
          <div className={styles.readonly}>
            <strong>Thanh toán: {paidLabel[record.paymentStatus] ?? record.paymentStatus}</strong>
            <span>Tổng: {money(record.totalVnd)} · Không thể sửa giá hoặc đánh dấu đã trả tại đây.</span>
            <span>Đối soát: {record.reconciliation === "MANUAL_REVIEW" ? "Cần xem ngoại lệ thanh toán muộn" : "Không có"}</span>
          </div>
          <ul>{record.items.map((item) => <li key={item.lineNumber}>{item.name} × {item.quantity} · {money(item.lineTotalVnd)}</li>)}</ul>
          {next ? <fieldset disabled={busy}>
            <label>Mã vận đơn (do cửa hàng nhập)<input value={trackingRef} maxLength={80} onChange={(event) => setTrackingRef(event.target.value)} /></label>
            <label>Tiến độ khách thấy<textarea rows={3} maxLength={4000} value={customerVisibleProgress} onChange={(event) => setCustomerVisibleProgress(event.target.value)} /></label>
            <label>Ghi chú nội bộ<textarea rows={3} maxLength={4000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
            <button type="submit">Chuyển sang {fulfilmentLabels[next]}</button>
          </fieldset> : <p>Đơn đã giao xong. Không thể lùi bước.</p>}
          <div>
            <h3>Lịch sử bước giao · 100 phiên bản gần nhất</h3>
            <p>Thời gian Việt Nam (UTC+7).</p>
            {record.history.length === 0 && <p>Chưa có lịch sử bước giao.</p>}
            {record.history.map((entry) => (
              <details key={entry.version}>
                <summary>{fulfilmentLabels[entry.fulfilmentStatus]} · {time(entry.createdAt)} · v{entry.version}</summary>
                <p className={styles.text}>Vận đơn: {entry.trackingRef || "Chưa có"}</p>
                <p className={styles.text}>Cho khách: {entry.customerVisibleProgress || "Chưa có ghi chú"}</p>
                <p className={styles.text}>Nội bộ: {entry.internalNote || "Chưa có ghi chú"}</p>
              </details>
            ))}
          </div>
        </form>}
        {!record && <p>Chọn đơn để xem chi tiết và cập nhật bước giao hàng.</p>}
        {role === "manager" && <div className={styles.panel}>
          <h2>Thanh toán muộn</h2>
          <p>Khoản này cần đối soát ngoài OneVoice. Không hoàn tiền và không đánh dấu đã thanh toán từ màn hình này.</p>
          {exceptions.length === 0 && <p>Không có ngoại lệ thanh toán muộn.</p>}
          {exceptions.map((item) => (
            <article className={styles.ticket} key={item.id}>
              <strong>{item.buyerName ?? "Chưa có tên khách"} · {money(item.totalVnd)}</strong>
              <span>Đơn …{item.orderId.slice(-8)} · {item.fulfilmentStatus} · {paidLabel[item.paymentStatus]}</span>
              <small>{time(item.createdAt)}{item.acknowledgedAt ? ` · Đã ghi nhận ${time(item.acknowledgedAt)}` : ""}</small>
              {!item.acknowledgedAt && <button disabled={busy} onClick={() => void run(() => acknowledge(item.id))}>Đã ghi nhận</button>}
            </article>
          ))}
        </div>}
      </div>
    </div>
  </section>;
}
