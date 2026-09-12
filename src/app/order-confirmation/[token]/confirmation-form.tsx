// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState, type FormEvent } from "react";
import type { ConfirmationQuote } from "@/lib/orders/confirmation";
import styles from "./confirmation.module.css";

function money(value: number | null) {
  return value == null ? "Chưa xác định" : `${value.toLocaleString("vi-VN")} ₫`;
}

export function ConfirmationForm({ token, initial }: { token: string; initial: ConfirmationQuote }) {
  const [quote, setQuote] = useState(initial);
  const [buyerName, setBuyerName] = useState(initial.buyerName ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [line1, setLine1] = useState(initial.address?.line1 ?? "");
  const [province, setProvince] = useState(initial.address?.province ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const saveId = useRef(crypto.randomUUID());
  const confirmId = useRef(crypto.randomUUID());
  const document = {
    buyerName, phone,
    address: { line1, ward: initial.address?.ward ?? null, district: initial.address?.district ?? null, province, countryCode: "VN" as const },
    items: quote.items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
  };
  async function post(body: unknown) {
    const response = await fetch(`/api/checkout/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload: unknown = await response.json();
    return { status: response.status, payload };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setStatus("");
    try {
      const result = await post({ action: "save", requestId: saveId.current, document });
      if (result.status !== 200 || !result.payload || typeof result.payload !== "object" || !("quote" in result.payload)) { setStatus("Không thể lưu. Kiểm tra thông tin và thử lại."); return; }
      const next = result.payload.quote as ConfirmationQuote;
      setQuote(next); saveId.current = crypto.randomUUID(); confirmId.current = crypto.randomUUID();
      setStatus("Đã cập nhật thông tin. Giá hiển thị là giá hiện hành.");
    } catch { setStatus("Kết nối bị gián đoạn. Thử lại cùng yêu cầu."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setStatus("");
    try {
      const result = await post({ action: "confirm", requestId: confirmId.current, orderVersion: quote.revision, subtotalVnd: quote.subtotalVnd, shippingFeeVnd: quote.shippingFeeVnd, totalVnd: quote.totalVnd });
      if (result.status !== 200 || !result.payload || typeof result.payload !== "object" || !("status" in result.payload)) { setStatus("Liên kết không khả dụng."); return; }
      const body = result.payload as { status: string; code?: string; quote?: ConfirmationQuote };
      if (body.quote) setQuote(body.quote);
      if (body.status === "blocked") setStatus("Phí giao hàng chưa được cửa hàng cấu hình. Không thể xác nhận.");
      else if (body.status === "changed") { confirmId.current = crypto.randomUUID(); setStatus("Giá hoặc phí đã thay đổi. Xem lại rồi xác nhận lại."); }
      else if (body.status === "confirmed") setStatus("Đã xác nhận đơn. Chưa thanh toán và chưa giữ hàng.");
    } catch { setStatus("Kết nối bị gián đoạn. Thử lại cùng yêu cầu."); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className={styles.form}>
      <p>Mở liên kết không đồng nghĩa với xác nhận. Tổng tiền do máy chủ tính lại.</p>
      <label>Tên người nhận<input required maxLength={200} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="name" /></label>
      <label>Điện thoại<input required maxLength={16} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label>
      <label>Địa chỉ<input required maxLength={300} value={line1} onChange={(event) => setLine1(event.target.value)} autoComplete="street-address" /></label>
      <label>Tỉnh/thành<input required maxLength={120} value={province} onChange={(event) => setProvince(event.target.value)} autoComplete="address-level1" /></label>
      <ul className={styles.items}>
        {quote.items.map((item) => (
          <li key={`${item.productId}:${item.variantId ?? ""}`}>{item.name}{item.sku ? ` · ${item.sku}` : ""} × {item.quantity} — {money(item.lineTotalVnd)}</li>
        ))}
      </ul>
      <p>Tạm tính: {money(quote.subtotalVnd)}</p>
      <p>Phí giao hàng: {quote.shippingFeeVnd == null ? "Chưa cấu hình (không phải miễn phí)" : money(quote.shippingFeeVnd)}</p>
      <p>Tổng: {money(quote.totalVnd)}</p>
      {status && <p role="status" className={styles.notice}>{status}</p>}
      <button type="submit" disabled={busy}>Cập nhật thông tin</button>
      <button type="button" disabled={busy || quote.shippingFeeVnd == null} onClick={() => void confirm()}>Xác nhận đơn</button>
    </form>
  );
}
