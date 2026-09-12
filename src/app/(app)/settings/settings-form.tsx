// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState, type FormEvent } from "react";
import type { SettingsSnapshot } from "@/lib/business/settings";
import styles from "./settings.module.css";

export function SettingsForm({ initial }: { initial: SettingsSnapshot }) {
  const [settings, setSettings] = useState(initial.settings);
  const [revision, setRevision] = useState(initial.revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const retry = useRef<{ body: string; id: string } | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setConflict(false);
    const cleanSettings = { ...settings, allowedTopics: settings.allowedTopics.map(topic => topic.trim()).filter(Boolean), forbiddenTopics: settings.forbiddenTopics.map(topic => topic.trim()).filter(Boolean) };
    const body = JSON.stringify({ expectedRevision: revision, settings: cleanSettings });
    if (retry.current?.body !== body) retry.current = { body, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, settings: cleanSettings, requestId: retry.current.id }) });
      if (response.status === 409) { setConflict(true); setMessage("Có người vừa lưu phiên bản mới. Nội dung bạn nhập vẫn được giữ; tải bản mới trước khi chỉnh sửa lại."); return; }
      if (!response.ok) { const error = await response.json(); setMessage(response.status === 400 ? "Kiểm tra dữ liệu: " + (error.fields?.map((field: { message: string }) => field.message).join("; ") || "Thông tin không hợp lệ.") : "Không thể lưu. Kiểm tra phiên đăng nhập và thử lại."); return; }
      const result: SettingsSnapshot = await response.json();
      setRevision(result.revision); setSettings(result.settings); retry.current = null; setMessage(`Đã lưu phiên bản ${result.revision}.`);
    } catch { setMessage("Kết nối bị gián đoạn. Bạn có thể bấm Lưu lại để thử lại cùng yêu cầu."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className={styles.form}>
    <p className={styles.notice}>{revision === 0 ? "Chưa lưu cấu hình: đang hiển thị giá trị mặc định." : `Phiên bản hiện tại: ${revision}.`} Lưu cấu hình không bật hoặc tiếp tục automation đang tạm dừng.</p>
    <fieldset disabled={busy}><legend>Thương hiệu</legend>
      <label>Tên doanh nghiệp<input required maxLength={120} value={settings.brandName} onChange={e => setSettings({ ...settings, brandName: e.target.value })} /></label>
      <label>Giọng điệu<textarea required maxLength={2000} rows={3} value={settings.brandVoice} onChange={e => setSettings({ ...settings, brandVoice: e.target.value })} /></label>
      <div className={styles.columns}>
        <label>Chủ đề cho phép <small>Mỗi dòng một chủ đề, tối đa 30.</small><textarea rows={4} value={settings.allowedTopics.join("\n")} onChange={e => setSettings({ ...settings, allowedTopics: e.target.value.split("\n") })} /></label>
        <label>Chủ đề không được dùng <small>Mỗi dòng một chủ đề, tối đa 30.</small><textarea rows={4} value={settings.forbiddenTopics.join("\n")} onChange={e => setSettings({ ...settings, forbiddenTopics: e.target.value.split("\n") })} /></label>
      </div>
    </fieldset>
    <fieldset disabled={busy}><legend>Mục tiêu nội dung</legend>
      <label>Cách chọn mục tiêu<select value={settings.goalSelection} onChange={e => setSettings({ ...settings, goalSelection: e.target.value as typeof settings.goalSelection })}><option value="auto">Hệ thống tự chọn</option><option value="manager">Người quản lý chỉ định</option></select></label>
      {settings.goalSelection === "manager" && <label>Mục tiêu chỉ định<textarea required maxLength={1000} rows={3} value={settings.managerGoal} onChange={e => setSettings({ ...settings, managerGoal: e.target.value })} placeholder="Ví dụ: giới thiệu chương trình phụ kiện tuần này" /></label>}
      <label>Chỉ số muốn cải thiện<select value={settings.objective} onChange={e => setSettings({ ...settings, objective: e.target.value as typeof settings.objective })}><option value="engagement">Tương tác</option><option value="messages">Tin nhắn</option><option value="paid-orders">Đơn đã thanh toán</option><option value="mixed">Kết hợp ba chỉ số</option></select></label>
      <p>Cách chọn mục tiêu độc lập với cách chọn giờ đăng. Chế độ kết hợp lưu lựa chọn cân bằng; chưa tự chạy tối ưu hay đăng bài.</p>
    </fieldset>
    <fieldset disabled={busy}><legend>Thời gian đăng</legend>
      <label>Múi giờ IANA<input required maxLength={80} value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })} placeholder="Asia/Ho_Chi_Minh" /></label>
      <label>Cách chọn thời gian<select value={settings.timingMode} onChange={e => setSettings({ ...settings, timingMode: e.target.value as typeof settings.timingMode })}><option value="auto">Hệ thống tự chọn thời gian và tần suất</option><option value="constrained">Giới hạn số bài và khung giờ</option></select></label>
      {settings.timingMode === "constrained" && <>
        <label>Tối đa bài mỗi ngày<input type="number" required min={1} max={30} value={settings.dailyCap} onChange={e => setSettings({ ...settings, dailyCap: Number(e.target.value) })} /></label>
        <p>Khung giờ theo múi giờ doanh nghiệp, không chồng lấn hoặc qua nửa đêm.</p>
        {settings.windows.map((window, index) => <div className={styles.window} key={index}>
          <label>Từ<input type="time" required value={window.start} onChange={e => setSettings({ ...settings, windows: settings.windows.map((item, i) => i === index ? { ...item, start: e.target.value } : item) })} /></label>
          <label>Đến<input type="time" required value={window.end} onChange={e => setSettings({ ...settings, windows: settings.windows.map((item, i) => i === index ? { ...item, end: e.target.value } : item) })} /></label>
          <button type="button" disabled={settings.windows.length === 1} onClick={() => setSettings({ ...settings, windows: settings.windows.filter((_, i) => i !== index) })}>Xóa</button>
        </div>)}
        <button type="button" disabled={settings.windows.length >= 7} onClick={() => setSettings({ ...settings, windows: [...settings.windows, { start: "18:00", end: "20:00" }] })}>Thêm khung giờ</button>
      </>}
    </fieldset>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {conflict && <button type="button" onClick={() => window.location.reload()}>Tải bản mới (bỏ nội dung chưa lưu)</button>}
    <button className={styles.save} type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu cấu hình"}</button>
  </form>;
}
