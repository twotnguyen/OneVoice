// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StudioProduct = Readonly<{
  id: string; name: string; sku: string | null; brand: string | null;
  priceVnd: number; currency: string; stockQuantity: number | null; collectedAt: string | null;
}>;
type ProductsResponse = Readonly<{ items: readonly StudioProduct[]; total: number }>;
type RenderResponse = Readonly<{
  renderId: string; status: "succeeded";
  content: { hook: string; caption: string; cta: string };
  urls: { status: string; video: string; download: string };
}>;
type DeskState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "ready"; result: RenderResponse }
  | { status: "error"; message: string };

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function safeRenderMessage(code?: string): string {
  if (code === "PRODUCT_NOT_FOUND") return "Sản phẩm không còn sẵn sàng. Hãy chọn sản phẩm khác.";
  if (code === "AI_GENERATION_FAILED") return "Dịch vụ viết nội dung chưa phản hồi. Bạn có thể thử lại.";
  if (code === "VIDEO_RENDER_FAILED") return "Máy dựng chưa thể hoàn thành video. Bạn có thể thử lại.";
  return "Chưa thể tạo video lúc này. Hãy thử lại sau ít phút.";
}

export function VideoStudio() {
  const [products, setProducts] = useState<readonly StudioProduct[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [desk, setDesk] = useState<DeskState>({ status: "idle" });

  const loadProducts = useCallback(async () => {
    setCatalogState("loading");
    try {
      const response = await fetch("/api/products?page=1&pageSize=18");
      if (!response.ok) throw new Error("catalog unavailable");
      const payload = await response.json() as ProductsResponse;
      setProducts(payload.items);
      setCatalogState(payload.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setCatalogState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/products?page=1&pageSize=18", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        return response.json() as Promise<ProductsResponse>;
      })
      .then((payload) => {
        setProducts(payload.items);
        setCatalogState(payload.items.length > 0 ? "ready" : "empty");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setCatalogState("error");
      });
    return () => controller.abort();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  async function createVideo() {
    if (!selectedId || desk.status === "creating") return;
    setDesk({ status: "creating" });
    try {
      const response = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderId: crypto.randomUUID(), productId: selectedId }),
      });
      const payload = await response.json() as RenderResponse | { error?: { code?: string } };
      if (!response.ok || !("status" in payload) || payload.status !== "succeeded") {
        setDesk({ status: "error", message: safeRenderMessage("error" in payload ? payload.error?.code : undefined) });
        return;
      }
      setDesk({ status: "ready", result: payload });
    } catch {
      setDesk({ status: "error", message: "Mất kết nối với máy dựng. Kiểm tra hệ thống rồi thử lại." });
    }
  }

  const operationLabel = catalogState === "loading" ? "Đang tải danh mục"
    : desk.status === "creating" ? "Đang tạo video"
      : desk.status === "ready" ? "Video đã sẵn sàng"
        : desk.status === "error" ? "Cần xử lý lại"
          : selectedProduct ? "Sẵn sàng tạo nội dung" : "Chờ chọn sản phẩm";

  return (
    <main className="studio-shell">
      <header className="studio-masthead">
        <div className="brand-lockup"><span className="brand-signal" aria-hidden="true" /><span className="brand-name">OneVoice</span></div>
        <div className="desk-status" aria-live="polite"><span className={`desk-status__light desk-status__light--${desk.status}`} aria-hidden="true" />{operationLabel}</div>
      </header>

      <section className="studio-intro" aria-labelledby="studio-title">
        <div><p className="phase">Bàn sản xuất video</p><h1 id="studio-title">Từ catalog đến video bán hàng.</h1></div>
        <p>Chọn một laptop từ dữ liệu đã kiểm duyệt. OneVoice viết thông điệp, dựng video dọc 12 giây và lưu bản hoàn chỉnh ngay trên máy này.</p>
      </section>

      <ol className="production-rail" aria-label="Quy trình sản xuất">
        <li className={selectedProduct ? "is-complete" : "is-current"}><span>Chọn sản phẩm</span><small>Catalog đã kiểm duyệt</small></li>
        <li className={desk.status === "creating" ? "is-current" : desk.status === "ready" ? "is-complete" : ""}><span>Tạo nội dung và dựng</span><small>Một tác vụ thực tế</small></li>
        <li className={desk.status === "ready" ? "is-current" : ""}><span>Duyệt thành phẩm</span><small>Phát và tải MP4</small></li>
      </ol>

      <div className="production-desk">
        <section className="desk-panel catalog-panel" aria-labelledby="catalog-title">
          <div className="panel-heading"><div><p className="panel-index">01</p><h2 id="catalog-title">Sản phẩm</h2></div>{catalogState === "ready" && <span>{products.length} lựa chọn</span>}</div>
          {catalogState === "loading" && <p className="state-note" role="status">Đang đọc danh mục sản phẩm…</p>}
          {catalogState === "error" && <div className="state-note state-note--error" role="alert"><p>Không thể tải danh mục.</p><button className="text-action" type="button" onClick={() => void loadProducts()}>Tải lại</button></div>}
          {catalogState === "empty" && <p className="state-note">Chưa có laptop đủ dữ liệu để sản xuất.</p>}
          {catalogState === "ready" && <div className="product-list" aria-label="Danh sách sản phẩm">
            {products.map((product) => {
              const selected = product.id === selectedId;
              return <button className="product-row" data-selected={selected || undefined} aria-pressed={selected} key={product.id} type="button" onClick={() => { setSelectedId(product.id); setDesk({ status: "idle" }); }}>
                <span className="product-row__marker" aria-hidden="true" />
                <span className="product-row__copy"><strong>{product.name}</strong><small>{[product.brand, product.sku].filter(Boolean).join(" · ") || "Không có mã SKU"}</small></span>
                <span className="product-row__price">{currency.format(product.priceVnd)}</span>
              </button>;
            })}
          </div>}
        </section>

        <section className="desk-panel script-panel" aria-labelledby="script-title">
          <div className="panel-heading"><div><p className="panel-index">02</p><h2 id="script-title">Kịch bản</h2></div></div>
          {!selectedProduct ? <p className="state-note">Chọn một sản phẩm để mở bàn biên tập.</p> : <>
            <div className="selected-product"><span>Sản phẩm đang chọn</span><strong>{selectedProduct.name}</strong><p>{currency.format(selectedProduct.priceVnd)}{selectedProduct.sku ? ` · ${selectedProduct.sku}` : ""}</p></div>
            {desk.status === "ready" ? <dl className="campaign-copy">
              <div><dt>Mở đầu</dt><dd>{desk.result.content.hook}</dd></div>
              <div><dt>Chú thích</dt><dd>{desk.result.content.caption}</dd></div>
              <div><dt>Kêu gọi</dt><dd>{desk.result.content.cta}</dd></div>
            </dl> : <p className="script-guidance">Nội dung chỉ dùng giá, SKU và thông tin trong bản chụp catalog hiện tại.</p>}
            <button className="primary-action" type="button" disabled={desk.status === "creating"} onClick={() => void createVideo()}>{desk.status === "creating" ? "Đang tạo video…" : desk.status === "error" ? "Thử tạo lại" : "Tạo video 12 giây"}</button>
            {desk.status === "creating" && <p className="operation-note" role="status">Máy dựng đang xử lý tác vụ bạn vừa gửi. Có thể mất khoảng một phút.</p>}
            {desk.status === "error" && <p className="operation-note operation-note--error" role="alert">{desk.message}</p>}
          </>}
        </section>

        <section className="desk-panel output-panel" aria-labelledby="output-title">
          <div className="panel-heading"><div><p className="panel-index">03</p><h2 id="output-title">Thành phẩm</h2></div></div>
          {desk.status === "ready" ? <div className="video-result">
            <video controls preload="metadata" src={desk.result.urls.video}>Trình duyệt của bạn không hỗ trợ phát video.</video>
            <div className="video-result__footer"><div><strong>Video dọc · 12 giây</strong><span>MP4 đã lưu cục bộ</span></div><a className="download-action" href={desk.result.urls.download} download>Tải video</a></div>
          </div> : <div className="output-placeholder" aria-hidden="true"><span className="frame-corner frame-corner--top" /><span>1080 × 1920</span><i /><p>Video hoàn chỉnh sẽ xuất hiện tại đây.</p><span className="frame-corner frame-corner--bottom" /></div>}
        </section>
      </div>
      <footer className="studio-footer"><span>Dữ liệu nội bộ · Không lập chỉ mục</span><a href="/api/health">Kiểm tra hệ thống</a></footer>
    </main>
  );
}
