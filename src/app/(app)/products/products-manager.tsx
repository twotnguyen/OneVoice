// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { managementCommandSchema, type ManagedProduct, type ManagementDocument, type ManagementListResult } from "@/lib/catalog/management";
import styles from "./products.module.css";
const money = (value: number | null) => value === null ? "Chưa có giá" : `${value.toLocaleString("vi-VN")} ₫`;
const numberOrNull = (value: string) => value === "" ? null : Number(value);
const emptyDocument = (): ManagementDocument => ({ name: "", sku: null, brand: null, productType: "other", descriptionText: null, priceVnd: null, stockQuantity: null, inStock: false, active: true, specifications: [], images: [], variants: [] });
export function ProductsManager({ initial }: { initial: ManagementListResult }) {
  const [list, setList] = useState(initial);
  const [current, setCurrent] = useState<ManagedProduct | null>(null);
  const [search, setSearch] = useState(""); const [group, setGroup] = useState(""); const [active, setActive] = useState("all");
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const retry = useRef<{ serialized: string; requestId: string } | null>(null);
  const doc = current?.document;
  const update = (patch: Partial<ManagementDocument>) => setCurrent((value) => value ? { ...value, document: { ...value.document, ...patch } } : null);
  async function loadList(page = 1) {
    const params = new URLSearchParams({ page: String(page), search, active });
    if (group.trim()) params.set("productType", group.trim());
    const result = await fetch(`/api/products/manage?${params}`, { cache: "no-store" });
    if (!result.ok) throw Error("Không tải được danh sách. Kiểm tra phiên đăng nhập.");
    setList(await result.json());
  }
  async function open(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await fetch(`/api/products/manage?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!result.ok) throw Error("Không tải được sản phẩm. Kiểm tra phiên đăng nhập.");
      setCurrent(await result.json()); setFailedImages([]); retry.current = null;
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!current) return;
    setError(""); setNotice("");
    const serialized = JSON.stringify({ productId: current.id, expectedVersion: current.version, document: current.document });
    if (retry.current?.serialized !== serialized) retry.current = { serialized, requestId: crypto.randomUUID() };
    const parsed = managementCommandSchema.safeParse({ requestId: retry.current.requestId, productId: current.id, expectedVersion: current.version, document: current.document });
    if (!parsed.success) { setError(`Kiểm tra dữ liệu: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).slice(0, 3).join("; ")}`); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/products/manage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.status === 409) throw Error("Sản phẩm đã thay đổi ở phiên khác. Bản nháp vẫn được giữ; tải lại dữ liệu đã lưu trước khi sửa tiếp.");
      if (!response.ok) throw Error(response.status === 403 ? "Bạn không có quyền lưu hoặc tài khoản đã bị vô hiệu hóa." : "Chưa xác nhận được việc lưu. Giữ bản nháp và thử lại.");
      const saved: { version: number } = await response.json();
      setCurrent({ ...current, version: saved.version }); retry.current = null;
      const refreshed = await fetch(`/api/products/manage?id=${current.id}`, { cache: "no-store" });
      if (refreshed.ok) setCurrent(await refreshed.json());
      setNotice(`Đã lưu phiên bản ${saved.version}. Dữ liệu hiện hành có hiệu lực ngay. URL ảnh được lưu độc lập với khả năng tải ảnh.`);
      await loadList(list.page);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <div className={styles.page}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>DỮ LIỆU DOANH NGHIỆP</p><h1>Sản phẩm</h1><p>Quản lý thông tin, giá và tồn vật lý của mọi nhóm sản phẩm.</p></div><button disabled={busy} onClick={() => { setCurrent({ id: crypto.randomUUID(), version: 0, document: emptyDocument(), sourceName: "OneVoice manual", sourceUrl: "", sourceProductId: null, editedAt: null }); setNotice(""); setError(""); }}>+ Thêm sản phẩm</button></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.workspace}>
      <section className={styles.list} aria-label="Danh sách sản phẩm">
        <form className={styles.filters} onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await loadList(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>
          <label>Tìm tên / SKU<input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /></label>
          <label>Nhóm sản phẩm<input placeholder="Tất cả nhóm; ví dụ keyboard" value={group} onChange={(event) => setGroup(event.target.value)} maxLength={100} /></label>
          <label>Trạng thái<select value={active} onChange={(event) => setActive(event.target.value)}><option value="all">Tất cả</option><option value="active">Đang dùng</option><option value="disabled">Đã vô hiệu hóa</option></select></label>
          <button disabled={busy}>Lọc danh sách</button>
        </form>
        <p className={styles.muted}>{list.total.toLocaleString("vi-VN")} sản phẩm · Trang {list.page}</p>
        <div className={styles.rows}>{list.items.map((item) => <button type="button" className={`${styles.row} ${current?.id === item.id ? styles.selected : ""}`} key={item.id} disabled={busy} onClick={() => void open(item.id)}><strong>{item.name}</strong><span>{item.productType || "other"} · {item.sku || "Chưa có SKU"}</span><span>{money(item.priceVnd)} · Tồn: {item.stockQuantity ?? "chưa rõ"}</span><small>{item.active ? "Đang dùng" : "Đã vô hiệu hóa"} · {item.sourceName || "Nguồn chưa rõ"}</small></button>)}</div>
        {list.items.length === 0 && <p>Không có sản phẩm phù hợp.</p>}
        <div className={styles.actions}><button disabled={busy || list.page <= 1} onClick={() => void loadList(list.page - 1).catch(() => setError("Không tải được trang."))}>Trước</button><button disabled={busy || list.page * list.pageSize >= list.total} onClick={() => void loadList(list.page + 1).catch(() => setError("Không tải được trang."))}>Sau</button></div>
      </section>
      <section className={styles.editor} aria-label="Chỉnh sửa sản phẩm">{!current || !doc ? <div className={styles.empty}><h2>Chọn một sản phẩm để chỉnh sửa</h2><p>Hoặc thêm sản phẩm mới. Dữ liệu nhập trước đây giữ nguyên nguồn gốc.</p></div> : <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className={styles.editorHeading}><h2>{current.version === 0 ? "Sản phẩm mới" : "Thông tin sản phẩm"}</h2><span>Phiên bản {current.version}</span></div>
        <div className={styles.provenance}><strong>Nguồn: {current.sourceName || "Chưa rõ"}</strong><p>{current.sourceUrl || "Mã nguồn nội bộ được tạo khi lưu."}</p>{current.sourceProductId && <p>Mã nguồn: {current.sourceProductId}</p>}<p>{current.editedAt ? `Chỉnh sửa thủ công: ${new Date(current.editedAt).toLocaleString("vi-VN")}` : "Chưa có chỉnh sửa thủ công."} Nguồn nhập không tự trở thành dữ liệu doanh nghiệp đã xác thực.</p></div>
        <fieldset disabled={busy} className={styles.fields}>
          <label className={styles.full}>Tên sản phẩm<input required maxLength={300} value={doc.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>SKU<input maxLength={100} value={doc.sku ?? ""} onChange={(e) => update({ sku: e.target.value || null })} /></label>
          <label>Thương hiệu<input maxLength={100} value={doc.brand ?? ""} onChange={(e) => update({ brand: e.target.value || null })} /></label>
          <label>Nhóm sản phẩm<input required maxLength={100} value={doc.productType} onChange={(e) => update({ productType: e.target.value })} /></label>
          <label>Giá sản phẩm (VND)<input type="number" min={0} step={1} value={doc.priceVnd ?? ""} onChange={(e) => update({ priceVnd: numberOrNull(e.target.value) })} /></label>
          <label>Tồn vật lý · để trống nếu chưa rõ<input type="number" min={0} step={1} disabled={doc.variants.length > 0} value={doc.stockQuantity ?? ""} onChange={(e) => update({ stockQuantity: numberOrNull(e.target.value) })} /></label>
          <label className={styles.check}><input type="checkbox" disabled={doc.variants.length > 0 || doc.stockQuantity === 0} checked={doc.stockQuantity === 0 ? false : doc.inStock} onChange={(e) => update({ inStock: e.target.checked })} />Có hàng theo thông tin hiện tại</label>
          {doc.variants.length > 0 && <p className={styles.full}>Tồn và trạng thái có hàng được tổng hợp từ các phiên bản đang dùng khi lưu. Nếu một phiên bản chưa rõ tồn, tổng tồn cũng chưa rõ. Đây chưa phải tồn khả dụng sau giữ hàng.</p>}
          <label className={styles.full}>Mô tả<textarea rows={3} maxLength={10000} value={doc.descriptionText ?? ""} onChange={(e) => update({ descriptionText: e.target.value || null })} /></label>
          <label className={styles.check}><input type="checkbox" checked={doc.active} onChange={(e) => update({ active: e.target.checked })} />Đang dùng · bỏ chọn để vô hiệu hóa, giữ lịch sử</label>
        </fieldset>
        <fieldset disabled={busy} className={styles.block}><legend>Thông số</legend>{doc.specifications.map((spec, index) => <div className={styles.specRow} key={index}><input aria-label={`Tên thông số ${index + 1}`} placeholder="Tên thông số" value={spec.name} onChange={(e) => update({ specifications: doc.specifications.map((s, i) => i === index ? { ...s, name: e.target.value } : s) })} /><input aria-label={`Giá trị thông số ${index + 1}`} placeholder="Giá trị" value={spec.value} onChange={(e) => update({ specifications: doc.specifications.map((s, i) => i === index ? { ...s, value: e.target.value } : s) })} /><button type="button" onClick={() => update({ specifications: doc.specifications.filter((_, i) => i !== index) })}>Bỏ</button></div>)}<button type="button" onClick={() => update({ specifications: [...doc.specifications, { name: "", value: "" }] })}>+ Thông số</button></fieldset>
        <fieldset disabled={busy} className={styles.block}><legend>Ảnh · URL HTTPS</legend><p>Ảnh đầu tiên là ảnh chính. Link lỗi vẫn có thể lưu; hệ thống không tải ảnh về khi lưu.</p>{doc.images.map((image, index) => <div className={styles.imageRow} key={image.id}><label>URL ảnh {index + 1}<input type="url" value={image.url} onChange={(e) => update({ images: doc.images.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} /></label><label>Mô tả ảnh<input value={image.altText ?? ""} onChange={(e) => update({ images: doc.images.map((item, i) => i === index ? { ...item, altText: e.target.value || null } : item) })} /></label>{image.url.startsWith("https://") && !failedImages.includes(image.url) ?
          // eslint-disable-next-line @next/next/no-img-element -- External catalog references are previewed directly, never proxied by the server.
          <img src={image.url} alt={image.altText || "Xem trước ảnh"} referrerPolicy="no-referrer" onError={() => setFailedImages((values) => [...values, image.url])} /> : <span className={styles.muted}>Chưa tải được ảnh. URL hợp lệ vẫn lưu được.</span>}<button type="button" onClick={() => update({ images: doc.images.filter((_, i) => i !== index) })}>Bỏ ảnh</button></div>)}<button type="button" onClick={() => update({ images: [...doc.images, { id: crypto.randomUUID(), url: "", altText: null }] })}>+ Ảnh</button></fieldset>
        <fieldset disabled={busy} className={styles.block}><legend>Phiên bản sản phẩm</legend><p>Mỗi phiên bản có giá và tồn vật lý riêng. Vô hiệu hóa giữ nguyên lịch sử.</p>{doc.variants.map((variant, index) => {
          const patchVariant = (patch: Partial<typeof variant>) => update({ variants: doc.variants.map((v, i) => i === index ? { ...v, ...patch } : v) });
          return <div className={styles.variant} key={variant.id}><label>Tên phiên bản<input value={variant.name ?? ""} onChange={(e) => patchVariant({ name: e.target.value || null })} /></label><label>SKU phiên bản<input value={variant.sku ?? ""} onChange={(e) => patchVariant({ sku: e.target.value || null })} /></label><label>Giá phiên bản (VND)<input type="number" min={0} step={1} value={variant.priceVnd ?? ""} onChange={(e) => patchVariant({ priceVnd: numberOrNull(e.target.value) })} /></label><label>Tồn vật lý · trống nếu chưa rõ<input type="number" min={0} step={1} value={variant.stockQuantity ?? ""} onChange={(e) => patchVariant({ stockQuantity: numberOrNull(e.target.value) })} /></label><label className={styles.full}>URL ảnh phiên bản<input type="url" value={variant.imageUrl ?? ""} onChange={(e) => patchVariant({ imageUrl: e.target.value || null })} /></label><label className={styles.check}><input type="checkbox" disabled={variant.stockQuantity === 0} checked={variant.stockQuantity === 0 ? false : variant.inStock === true} onChange={(e) => patchVariant({ inStock: e.target.checked })} />Có hàng</label><label className={styles.check}><input type="checkbox" checked={variant.active} onChange={(e) => patchVariant({ active: e.target.checked })} />Đang dùng</label></div>;
        })}<button type="button" onClick={() => update({ variants: [...doc.variants, { id: crypto.randomUUID(), name: null, sku: null, priceVnd: null, stockQuantity: null, inStock: null, active: true, imageUrl: null }] })}>+ Phiên bản</button></fieldset>
        <div className={styles.footer}><button disabled={busy} type="submit">{busy ? "Đang xử lý…" : "Lưu sản phẩm"}</button>{current.version > 0 && <button disabled={busy} type="button" onClick={() => void open(current.id)}>Tải lại dữ liệu đã lưu</button>}</div>
      </form>}</section>
    </div>
  </div>;
}
