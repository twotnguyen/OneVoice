// SPDX-License-Identifier: Apache-2.0
import { createStatusPageService, statusHeaders, type StatusLookupPort } from "@/lib/consultation/status-lookup";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import styles from "./status.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
  title: "Tiến độ đơn hàng",
};

function port(): StatusLookupPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

const labels: Record<string, string> = {
  DRAFT: "Nháp", AWAITING_PAYMENT: "Chờ thanh toán", PREPARING: "Chuẩn bị", DELIVERING: "Đang giao",
  DELIVERED: "Đã giao", EXPIRED: "Hết hạn", CANCELLED: "Đã hủy", UNPAID: "Chưa thanh toán", FAILED: "Thanh toán lỗi", PAID: "Đã thanh toán",
  RECEIVED: "Đã nhận", INSPECTING: "Đang kiểm tra", IN_SERVICE: "Đang bảo hành", READY: "Sẵn sàng", COMPLETED: "Hoàn tất",
};

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await createStatusPageService(port()).read(token);
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="status-heading">
        <p className={styles.brand}>ONEVOICE</p>
        <h1 id="status-heading">Tiến độ đơn hàng</h1>
        {result.ok ? (
          <>
            <p>Trạng thái: {labels[result.status.order.fulfilmentStatus] ?? result.status.order.fulfilmentStatus}</p>
            <p>Thanh toán: {labels[result.status.order.paymentStatus] ?? result.status.order.paymentStatus}</p>
            {result.status.order.trackingRef ? <p>Mã vận đơn: {result.status.order.trackingRef}</p> : null}
            {result.status.order.customerVisibleProgress ? <p className={styles.progress}>{result.status.order.customerVisibleProgress}</p> : null}
            <ul className={styles.items}>
              {result.status.order.items.map((item) => (
                <li key={`${item.sku ?? item.name}:${item.quantity}`}>{item.name}{item.sku ? ` · ${item.sku}` : ""} × {item.quantity}</li>
              ))}
            </ul>
            {result.status.warranty.map((entry) => (
              <p key={entry.id}>Bảo hành: {labels[entry.status] ?? entry.status}{entry.customerNote ? ` — ${entry.customerNote}` : ""}</p>
            ))}
            <p className={styles.asOf}>Cập nhật: {result.status.asOf}</p>
          </>
        ) : <p role="alert" className={styles.error}>Liên kết không khả dụng.</p>}
      </section>
    </main>
  );
}

export function headers() {
  return statusHeaders();
}
