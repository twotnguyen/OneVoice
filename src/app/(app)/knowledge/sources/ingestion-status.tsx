// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import type { IngestionStatus } from "@/lib/knowledge/ingestion-repository";
const labels: Record<string, string> = { not_loaded: "Chưa nạp", queued: "Đang chờ xử lý", running: "Đang nạp", retrying: "Đang chờ thử lại", failed: "Nạp thất bại", dead: "Đã hết lượt thử", ready: "Sẵn sàng dùng", stale: "Đã hết hạn", disabled: "Nguồn đã tắt", succeeded: "Tác vụ đã kết thúc" };
export function IngestionStatusPanel({ sourceId, version, active }: { sourceId: string; version: number; active: boolean }) {
 const [status, setStatus] = useState<IngestionStatus | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
 useEffect(() => { const abort = new AbortController(); fetch(`/api/knowledge/ingestion?sourceId=${sourceId}`, { signal: abort.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw Error(); setStatus(await response.json()); }).catch(() => { if (!abort.signal.aborted) setNotice("Không đọc được trạng thái nạp."); }); return () => abort.abort(); }, [sourceId, version]);
 async function refresh(enqueue: boolean) {
  setBusy(true); setNotice("");
  try {
   if (enqueue) { const response = await fetch("/api/knowledge/ingestion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId, version }) }); if (!response.ok) throw Error(); setNotice("Đã xếp hàng nạp. Các yêu cầu cùng nguồn/phiên bản trong 15 phút dùng chung một tác vụ."); }
   const response = await fetch(`/api/knowledge/ingestion?sourceId=${sourceId}`, { cache: "no-store" }); if (!response.ok) throw Error(); setStatus(await response.json());
  } catch { setNotice("Chưa thực hiện được. Tải lại bản nguồn đã lưu và kiểm tra quyền truy cập."); } finally { setBusy(false); }
 }
 return <section aria-label="Trạng thái nạp tri thức"><h3>Nạp nội dung</h3><p>{status ? labels[status.status] ?? "Chưa rõ trạng thái" : "Đang đọc trạng thái…"}{status?.attempts ? ` · Lượt thử ${status.attempts}/3` : ""}</p>{status?.fetchedAt && <p>Nạp lúc {new Date(status.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (UTC+7)</p>}{status?.error && <p>Chi tiết lỗi: {status.error}</p>}<p>Yêu cầu được xử lý trong nền. Chỉ nội dung nạp thành công và còn hiệu lực được dùng để tư vấn.</p><button type="button" disabled={busy || !active} onClick={() => void refresh(true)}>Yêu cầu nạp / làm mới</button>{" "}<button type="button" disabled={busy} onClick={() => void refresh(false)}>Đọc lại trạng thái</button>{notice && <p role="status">{notice}</p>}</section>;
}
