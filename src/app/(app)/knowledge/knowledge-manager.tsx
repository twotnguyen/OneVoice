// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { knowledgeCommandSchema, type KnowledgeDocument, type KnowledgeRecord, type KnowledgePage } from "@/lib/knowledge/management";
import { dateOffsets, offsetLabel, instantToInput, inputToInstant } from "@/lib/knowledge/date-input";
import styles from "./knowledge.module.css";
const kindNames = { return: "Chính sách đổi trả", warranty: "Chính sách bảo hành", service: "Thông tin dịch vụ", promotion: "Khuyến mãi" };
const effectiveLabel = (document: KnowledgeDocument) => !document.active ? "Đã tắt" : document.startsAt && Date.parse(document.startsAt) > Date.now() ? "Chưa hiệu lực" : document.expiresAt && Date.parse(document.expiresAt) <= Date.now() ? "Hết hạn" : "Đang hiệu lực";
type ProductChoice = { id: string; name: string };
export function KnowledgeManager({ initial }: { initial: KnowledgePage }) {
  const [list, setList] = useState(initial); const [kind, setKind] = useState("policy"); const [search, setSearch] = useState("");
  const [current, setCurrent] = useState<KnowledgeRecord | null>(null); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [productSearch, setProductSearch] = useState(""); const [choices, setChoices] = useState<ProductChoice[]>([]); const [names, setNames] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Array<{ version: number; created_at: string; document: KnowledgeDocument }>>([]);
  const [dateOffset, setDateOffset] = useState(420);
  const retry = useRef<{ serialized: string; requestId: string } | null>(null);
  const doc = current?.document;
  const patch = (value: Partial<KnowledgeDocument>) => setCurrent(item => item ? { ...item, document: { ...item.document, ...value } } : null);
  function pickTime(field: "startsAt" | "expiresAt", value: string) {
    try { patch({ [field]: inputToInstant(value, dateOffset) }); }
    catch { setNotice("Ngày giờ không hợp lệ. Hãy chọn lại bằng lịch."); }
  }
  async function load(page = 1, selectedKind = kind) {
    const response = await fetch(`/api/knowledge?${new URLSearchParams({ kind: selectedKind, search, page: String(page) })}`, { cache: "no-store" });
    if (!response.ok) throw Error("Không tải được danh sách. Kiểm tra phiên đăng nhập.");
    setList(await response.json());
  }
  async function open(item: KnowledgeRecord) {
    setCurrent(item); setNotice(""); setHistory([]); setChoices([]); retry.current = null;
    if (item.document.productIds.length) {
      setBusy(true);
      try { const response = await fetch(`/api/knowledge?scope=${item.document.productIds.join(",")}`); if (response.ok) { const products: ProductChoice[] = await response.json(); setNames(old => ({ ...old, ...Object.fromEntries(products.map(product => [product.id, product.name])) })); } }
      catch { setNotice("Không tải được tên sản phẩm. Phạm vi đã lưu vẫn được giữ nguyên."); }
      finally { setBusy(false); }
    }
  }
  function add() {
    setCurrent({ id: crypto.randomUUID(), version: 0, source: "Do người quản lý nhập", document: { kind: kind === "promotion" ? "promotion" : "return", title: "", body: "", startsAt: null, expiresAt: null, active: true, scope: "all", productIds: [], discountType: null, discountValue: null } });
    setNotice(""); setHistory([]); setChoices([]); retry.current = null;
  }
  async function save() {
    if (!current) return;
    const serialized = JSON.stringify({ id: current.id, expectedVersion: current.version, document: current.document });
    if (retry.current?.serialized !== serialized) retry.current = { serialized, requestId: crypto.randomUUID() };
    const parsed = knowledgeCommandSchema.safeParse({ id: current.id, expectedVersion: current.version, requestId: retry.current.requestId, document: current.document });
    if (!parsed.success) { setNotice(parsed.error.issues.map(issue => issue.message).slice(0, 3).join(" ")); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.status === 409) throw Error("Bản đã lưu thay đổi ở phiên khác. Bản nháp vẫn được giữ; tải lại danh sách và chọn bản mới trước khi sửa tiếp.");
      if (!response.ok) throw Error("Chưa xác nhận được việc lưu. Kiểm tra quyền, dữ liệu và thử lại.");
      const result: { version: number } = await response.json(); setCurrent({ ...current, version: result.version, document: parsed.data.document }); retry.current = null;
      setNotice(`Đã lưu phiên bản ${result.version}. Nội dung chỉ cung cấp thông tin; không tự chấp thuận đổi trả hoặc bảo hành.`);
      await load(list.page);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function searchProducts() {
    setBusy(true);
    try { const response = await fetch(`/api/products/manage?${new URLSearchParams({ search: productSearch, pageSize: "20", active: "active" })}`); if (!response.ok) throw Error("Không tải được sản phẩm."); const result = await response.json(); setChoices(result.items); setNames(old => ({ ...old, ...Object.fromEntries(result.items.map((item: ProductChoice) => [item.id, item.name])) })); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function readHistory() {
    if (!current) return; setBusy(true);
    try { const response = await fetch(`/api/knowledge?history=${current.id}`); if (!response.ok) throw Error("Không tải được lịch sử."); setHistory(await response.json()); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  return <section className={styles.page}><header><h1>Chính sách và khuyến mãi</h1><p>Thông tin doanh nghiệp có hiệu lực ngay khi lưu. Các chương trình chồng thời gian được xem riêng, không tự cộng dồn giảm giá.</p><a href="/settings">← Cấu hình doanh nghiệp</a> · <a href="/knowledge/sources">Nguồn dữ liệu và mức độ tin cậy →</a> · <a href="/knowledge/gaps">Thông tin cần bổ sung →</a></header>
    <div className={styles.toolbar}><select aria-label="Nhóm nội dung" value={kind} disabled={busy} onChange={async e => { const value = e.target.value; setKind(value); setCurrent(null); setBusy(true); try { await load(1, value); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}><option value="policy">Chính sách và dịch vụ</option><option value="promotion">Khuyến mãi</option></select><input aria-label="Tìm nội dung" placeholder="Tìm theo tiêu đề" value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /><button disabled={busy} onClick={async () => { setBusy(true); try { await load(); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}>Tìm / tải lại</button><button disabled={busy} onClick={add}>Thêm nội dung</button></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.workspace}><aside><p>{list.total} nội dung · Trang {list.page}</p>{list.items.map(item => <button className={styles.item} key={item.id} disabled={busy} onClick={() => void open(item)}><strong>{item.document.title}</strong><span>{kindNames[item.document.kind]} · {effectiveLabel(item.document)}</span><small>{item.source}</small></button>)}{list.items.length === 0 && <p>Chưa có nội dung phù hợp.</p>}<div className={styles.toolbar}><button disabled={busy || list.page <= 1} onClick={() => void load(list.page - 1).catch(() => setNotice("Không tải được trang."))}>Trước</button><button disabled={busy || list.page * list.pageSize >= list.total} onClick={() => void load(list.page + 1).catch(() => setNotice("Không tải được trang."))}>Sau</button></div></aside>
    <div>{!current || !doc ? <p>Chọn một nội dung hoặc thêm mới.</p> : <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.form}>
      <h2>{current.version ? `Chỉnh sửa · phiên bản ${current.version}` : "Nội dung mới"}</h2><p>{current.source}. Nguồn nhập được giữ lại khi chỉnh sửa.</p>
      <fieldset disabled={busy}>
        <label>Loại nội dung<select disabled={current.version > 0 || kind === "promotion"} value={doc.kind} onChange={e => patch({ kind: e.target.value as KnowledgeDocument["kind"] })}>{Object.entries(kindNames).filter(([key]) => kind === "promotion" ? key === "promotion" : key !== "promotion").map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Tiêu đề<input required maxLength={200} value={doc.title} onChange={e => patch({ title: e.target.value })} /></label>
        <label>Nội dung văn bản<textarea required rows={7} maxLength={10000} value={doc.body} onChange={e => patch({ body: e.target.value })} /></label>
        <label>Múi giờ hiển thị (độ lệch UTC cố định)<select value={dateOffset} onChange={e => setDateOffset(Number(e.target.value))}>{dateOffsets.map(offset => <option key={offset} value={offset}>{offsetLabel(offset)}{offset === 420 ? " · Việt Nam" : ""}</option>)}</select></label>
        <p>Chọn ngày và giờ theo múi giờ trên. Đổi múi giờ chỉ đổi cách hiển thị, giữ nguyên thời điểm đã chọn. Bỏ trống để không giới hạn.</p>
        <div className={styles.columns}><label>Bắt đầu · có hiệu lực từ lúc này<input type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59" value={instantToInput(doc.startsAt, dateOffset)} onChange={e => pickTime("startsAt", e.target.value)} /></label><label>Kết thúc · hết hiệu lực từ lúc này<input type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59" value={instantToInput(doc.expiresAt, dateOffset)} onChange={e => pickTime("expiresAt", e.target.value)} /></label></div>
        <label className={styles.check}><input type="checkbox" checked={doc.active} onChange={e => patch({ active: e.target.checked })} />Đang dùng (bỏ chọn để tắt, giữ lịch sử)</label>
        {doc.kind === "promotion" && <div className={styles.columns}><label>Loại mức giảm<select value={doc.discountType ?? ""} onChange={e => patch({ discountType: e.target.value || null })}><option value="">Mô tả trong nội dung</option><option value="percent">Phần trăm</option><option value="fixed">Số tiền VND</option>{doc.discountType && !["percent", "fixed"].includes(doc.discountType) && <option value={doc.discountType}>Giữ loại đã nhập: {doc.discountType}</option>}</select></label><label>Mức giảm · để trống nếu không áp dụng<input type="number" min={0} value={doc.discountValue ?? ""} onChange={e => patch({ discountValue: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>}
        <h3>Phạm vi áp dụng</h3><label>Áp dụng cho<select value={doc.scope} onChange={e => patch({ scope: e.target.value as "all" | "products", productIds: e.target.value === "all" ? [] : doc.productIds })}><option value="all">Toàn doanh nghiệp / chương trình chung</option><option value="products">Các sản phẩm được chọn</option></select></label>
        {doc.scope === "products" && <><p>Chọn từ 1 đến 100 sản phẩm. Chương trình nhập trước đây giữ phạm vi sản phẩm, không tự chuyển thành chương trình chung.</p>
        <div className={styles.toolbar}><input aria-label="Tìm sản phẩm áp dụng" placeholder="Tìm tên hoặc SKU" value={productSearch} onChange={e => setProductSearch(e.target.value)} maxLength={100} /><button type="button" onClick={() => void searchProducts()}>Tìm sản phẩm</button></div>
        {choices.map(product => <label className={styles.check} key={product.id}><input type="checkbox" checked={doc.productIds.includes(product.id)} onChange={e => patch({ productIds: e.target.checked ? [...doc.productIds, product.id] : doc.productIds.filter(id => id !== product.id) })} />{product.name}</label>)}
        {doc.productIds.length > 0 && <div><p>Đã chọn {doc.productIds.length} sản phẩm:</p>{doc.productIds.map(id => <div className={styles.selected} key={id}><span>{names[id] ?? "Sản phẩm đã lưu trong phạm vi"}</span><button type="button" onClick={() => patch({ productIds: doc.productIds.filter(value => value !== id) })}>Bỏ</button></div>)}</div>}</>}
      </fieldset><button type="submit" disabled={busy}>{busy ? "Đang xử lý…" : "Lưu nội dung"}</button>{current.version > 0 && <button type="button" disabled={busy} onClick={() => void readHistory()}>Xem lịch sử (50 phiên bản gần nhất)</button>}
      {history.map(item => <details key={item.version}><summary>Phiên bản {item.version} · {new Date(item.created_at).toLocaleString("vi-VN", { timeZone: "UTC" })} UTC</summary><h3>{item.document.title}</h3><p className={styles.text}>{item.document.body}</p><p>{effectiveLabel(item.document)} · Bắt đầu: {item.document.startsAt ?? "Không giới hạn"} · Kết thúc: {item.document.expiresAt ?? "Không giới hạn"}</p></details>)}
    </form>}</div></div>
  </section>;
}
