// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { RenderStage } from "@/lib/render/types";
import {
  checkDownloadArtifact,
  formatSnapshotLabel,
  initialStudioState,
  isSucceededRenderResponse,
  isValidRenderId,
  newStudioUuid,
  nextPollDelayMs,
  parseRunningStage,
  readJsonBody,
  STUDIO_POLL_TOTAL_TIMEOUT_MS,
  StudioOperationController,
  studioReducer,
} from "./video-studio-state";

type StudioProduct = Readonly<{
  id: string; name: string; sku: string | null; brand: string | null;
  priceVnd: number; currency: string; stockQuantity: number | null; collectedAt: string | null;
}>;
type ProductsResponse = Readonly<{
  items: readonly StudioProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>;
const PAGE_SIZE = 18;
const BRANDS = ["ACER", "ASUS", "DELL", "GIGABYTE", "HP", "LENOVO", "LG", "MSI"] as const;
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const stageLabels: Record<RenderStage, string> = {
  loading_product: "Đang tải bản chụp sản phẩm",
  generating_content: "Đang tạo nội dung",
  resolving_asset: "Đang xử lý ảnh sản phẩm",
  synthesizing_voice: "Đang tạo giọng đọc",
  composing_scenes: "Đang dựng từng cảnh",
  rendering_video: "Đang dựng video",
  storing_artifact: "Đang lưu thành phẩm",
};

function safeRenderMessage(code?: string): string {
  if (code === "RENDER_ID_IN_USE") return "Yêu cầu này đang được xử lý. Vui lòng chờ trong giây lát rồi thử lại.";
  if (code === "PRODUCT_NOT_FOUND") return "Sản phẩm không còn sẵn sàng. Hãy chọn sản phẩm khác.";
  if (code === "AI_GENERATION_FAILED") return "Dịch vụ viết nội dung chưa phản hồi. Bạn có thể thử lại.";
  if (code === "IMAGE_RESOLUTION_FAILED") return "Máy xử lý ảnh chưa sẵn sàng. Kiểm tra hệ thống rồi thử lại.";
  if (code === "VIDEO_RENDER_FAILED") return "Máy dựng chưa thể hoàn thành video. Bạn có thể thử lại.";
  return "Chưa thể tạo video lúc này. Hãy thử lại sau ít phút.";
}

export function VideoStudio() {
  const [products, setProducts] = useState<readonly StudioProduct[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [studio, dispatch] = useReducer(studioReducer, initialStudioState);
  const operationController = useRef(new StudioOperationController());
  const { selectedId, desk } = studio;

  const searchRef = useRef(search);
  searchRef.current = search;
  const brandRef = useRef(selectedBrand);
  brandRef.current = selectedBrand;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadProducts = useCallback((
    pageToLoad: number,
    signal?: AbortSignal,
    currentSearch?: string,
    currentBrand?: string | null,
  ) => {
    const brand = currentBrand !== undefined ? currentBrand : brandRef.current;
    const s = currentSearch !== undefined ? currentSearch : searchRef.current;
    let url = `/api/products?page=${pageToLoad}&pageSize=${PAGE_SIZE}`;
    if (brand) {
      url += `&brand=${encodeURIComponent(brand)}`;
    }
    if (s && s.trim()) {
      url += `&search=${encodeURIComponent(s.trim())}`;
    }
    return fetch(url, signal ? { signal } : undefined)
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        const payload = (await readJsonBody(response)) as ProductsResponse | null;
        if (!payload || !Array.isArray(payload.items)) throw new Error("catalog unavailable");
        const total = typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : payload.items.length;
        const serverTotalPages = typeof payload.totalPages === "number" && Number.isFinite(payload.totalPages) && payload.totalPages >= 1
          ? Math.floor(payload.totalPages)
          : 1;
        const serverPage = typeof payload.page === "number" && Number.isFinite(payload.page) && payload.page >= 1
          ? Math.floor(payload.page)
          : pageToLoad;
        setProducts(payload.items);
        setTotalCount(total);
        setTotalPages(serverTotalPages);
        setPage(serverPage);
        setCatalogState(payload.items.length > 0 ? "ready" : "empty");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setCatalogState("error");
      });
  }, []);

  const reloadProducts = useCallback(() => {
    setCatalogState("loading");
    void loadProducts(page, undefined, debouncedSearch, selectedBrand);
  }, [loadProducts, page, debouncedSearch, selectedBrand]);

  const goToPage = useCallback((nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setCatalogState("loading");
    void loadProducts(nextPage, undefined, debouncedSearch, selectedBrand);
  }, [loadProducts, page, totalPages, debouncedSearch, selectedBrand]);

  const handleBrandClick = useCallback((brand: string | null) => {
    const nextBrand = brand === null ? null : selectedBrand === brand ? null : brand;
    if (nextBrand === selectedBrand) {
      if (page !== 1) {
        setCatalogState("loading");
        void loadProducts(1, undefined, debouncedSearch, nextBrand);
      }
      return;
    }
    setSelectedBrand(nextBrand);
  }, [selectedBrand, page, loadProducts, debouncedSearch]);

  useEffect(() => {
    setCatalogState("loading");
    const controller = new AbortController();
    void loadProducts(1, controller.signal, debouncedSearch, selectedBrand);
    return () => controller.abort();
  }, [debouncedSearch, selectedBrand, loadProducts]);

  useEffect(() => {
    const operations = operationController.current;
    return () => operations.dispose();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  async function createVideo() {
    if (!selectedId || desk.status === "creating") return;
    const operation = { token: newStudioUuid(), renderId: newStudioUuid(), productId: selectedId };
    if (!isValidRenderId(operation.renderId)) {
      dispatch({ type: "start", operation });
      dispatch({ type: "failure", token: operation.token, message: "Không thể khởi tạo mã tác vụ. Hãy thử lại." });
      return;
    }
    const controller = operationController.current.start();
    if (!controller) return;
    dispatch({ type: "start", operation });
    let settled = false;
    const pollStartedAt = Date.now();
    void (async () => {
      let attempt = 0;
      while (!settled && !controller.signal.aborted) {
        if (Date.now() - pollStartedAt > STUDIO_POLL_TOTAL_TIMEOUT_MS) return;
        try {
          const response = await fetch(`/api/renders/${operation.renderId}`, { signal: controller.signal, cache: "no-store" });
          if (response.ok) {
            const stage = parseRunningStage(await readJsonBody(response));
            if (stage) dispatch({ type: "progress", token: operation.token, stage });
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        const delay = nextPollDelayMs(attempt);
        attempt += 1;
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, delay);
          controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    })();
    try {
      const response = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderId: operation.renderId, productId: operation.productId }),
        signal: controller.signal,
      });
      const payload = await readJsonBody(response);
      const errorCode = payload !== null && typeof payload === "object" && "error" in payload &&
        payload.error !== null && typeof payload.error === "object" && "code" in payload.error &&
        typeof payload.error.code === "string"
        ? payload.error.code
        : undefined;
      if (!response.ok || !isSucceededRenderResponse(payload) || payload.renderId !== operation.renderId) {
        dispatch({ type: "failure", token: operation.token, message: safeRenderMessage(errorCode) });
        return;
      }
      dispatch({ type: "success", token: operation.token, result: payload });
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "failure", token: operation.token, message: "Mất kết nối với máy dựng. Kiểm tra hệ thống rồi thử lại." });
    } finally {
      settled = true;
      controller.abort();
      operationController.current.finish(controller);
    }
  }

  async function downloadVideo() {
    if (desk.status !== "ready") return;
    try {
      if (!(await checkDownloadArtifact(desk.result.urls.download))) throw new Error("artifact unavailable");
      const link = document.createElement("a");
      link.href = desk.result.urls.download;
      link.download = `onevoice-${desk.result.renderId}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      dispatch({ type: "artifact_failure", token: desk.operation.token });
    }
  }

  const operationLabel = catalogState === "loading" ? "Đang tải danh mục"
    : desk.status === "creating" ? (desk.stage ? stageLabels[desk.stage] : "Đang đăng ký tác vụ")
      : desk.status === "ready" ? "Video đã sẵn sàng"
        : desk.status === "error" || desk.status === "artifact_error" ? "Cần xử lý lại"
          : selectedProduct ? "Sẵn sàng tạo nội dung" : "Chờ chọn sản phẩm";

  return (
    <div className="studio-shell">
      <header className="studio-masthead">
        <div className="brand-lockup"><span className="brand-signal" aria-hidden="true" /><span className="brand-name">OneVoice</span></div>
        <div className="desk-status" aria-live="polite"><span className={`desk-status__light desk-status__light--${desk.status}`} aria-hidden="true" />{operationLabel}</div>
      </header>

      <section className="studio-intro" aria-labelledby="studio-title">
        <div><p className="phase">Bàn sản xuất video</p><h1 id="studio-title">Từ catalog đến video bán hàng.</h1></div>
        <p>Chọn một laptop từ bản chụp catalog công khai. OneVoice viết thông điệp, dựng video dọc 12 giây và lưu bản hoàn chỉnh ngay trên máy này.</p>
      </section>

      <ol className="production-rail" aria-label="Quy trình sản xuất">
        <li className={selectedProduct ? "is-complete" : "is-current"}><span>Chọn sản phẩm</span><small>Bản chụp catalog công khai</small></li>
        <li className={desk.status === "creating" && desk.stage ? "is-current" : desk.status === "ready" ? "is-complete" : ""}><span>Tạo nội dung và dựng</span><small>{desk.status === "creating" && desk.stage ? stageLabels[desk.stage] : "Chờ trạng thái máy chủ"}</small></li>
        <li className={desk.status === "ready" ? "is-current" : ""}><span>Duyệt thành phẩm</span><small>Phát và tải MP4</small></li>
      </ol>

      <div className="production-desk">
        <section className="desk-panel catalog-panel" aria-labelledby="catalog-title">
          <div className="panel-heading"><div><p className="panel-index">01</p><h2 id="catalog-title">Sản phẩm</h2></div>{catalogState === "ready" && <span>{totalCount} lựa chọn</span>}</div>
          <div className="catalog-controls">
            <input
              type="search"
              className="catalog-search-input"
              placeholder="Tìm theo tên máy, mã SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={desk.status === "creating"}
              aria-label="Tìm theo tên máy, mã SKU"
            />
            <div className="brand-pills" role="toolbar" aria-label="Lọc theo thương hiệu">
              <button
                type="button"
                className={selectedBrand === null ? "brand-pill brand-pill--active" : "brand-pill"}
                onClick={() => handleBrandClick(null)}
                aria-pressed={selectedBrand === null}
                disabled={desk.status === "creating"}
              >
                Tất cả
              </button>
              {BRANDS.map((brand) => {
                const active = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    type="button"
                    className={active ? "brand-pill brand-pill--active" : "brand-pill"}
                    onClick={() => handleBrandClick(brand)}
                    aria-pressed={active}
                    disabled={desk.status === "creating"}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          </div>
          {catalogState === "loading" && <p className="state-note" role="status">Đang đọc danh mục sản phẩm…</p>}
          {catalogState === "error" && <div className="state-note state-note--error" role="alert"><p>Không thể tải danh mục.</p><button className="text-action" type="button" onClick={reloadProducts}>Tải lại</button></div>}
          {catalogState === "empty" && <p className="state-note">Chưa có laptop đủ dữ liệu để sản xuất.</p>}
          {catalogState === "ready" && <><div className="product-list" aria-label="Danh sách sản phẩm">
            {products.map((product) => {
              const selected = product.id === selectedId;
              const meta = [product.brand, product.sku].filter(Boolean).join(" · ");
              const formattedPrice = currency.format(product.priceVnd ?? 0);
              const ariaLabel = `${product.name}${meta ? ` · ${meta}` : ""}${formattedPrice ? ` · ${formattedPrice}` : ""}`;
              return <button
                className="product-row"
                data-selected={selected || undefined}
                aria-pressed={selected}
                aria-label={ariaLabel}
                title={product.name}
                disabled={desk.status === "creating"}
                key={product.id}
                type="button"
                onClick={() => dispatch({ type: "select", productId: product.id })}
              >
                <span className="product-row__marker" aria-hidden="true" />
                <span className="product-row__copy"><strong>{product.name}</strong><small>{meta || "Không có mã SKU"}</small></span>
                <span className="product-row__price">{formattedPrice}</span>
              </button>;
            })}
          </div><nav className="catalog-pagination" aria-label="Phân trang danh mục">
            <button className="text-action" type="button" disabled={page <= 1 || desk.status === "creating"} onClick={() => goToPage(page - 1)}>Trước</button>
            <span aria-live="polite">Trang {page}/{totalPages} · Tổng {totalCount}</span>
            <button className="text-action" type="button" disabled={page >= totalPages || desk.status === "creating"} onClick={() => goToPage(page + 1)}>Sau</button>
          </nav></>}
        </section>

        <section className="desk-panel script-panel" aria-labelledby="script-title">
          <div className="panel-heading"><div><p className="panel-index">02</p><h2 id="script-title">Kịch bản</h2></div></div>
          {!selectedProduct ? <p className="state-note">Chọn một sản phẩm để mở bàn biên tập.</p> : <>
            <div className="selected-product"><span>Sản phẩm đang chọn</span><strong>{selectedProduct.name}</strong><p>{currency.format(selectedProduct.priceVnd ?? 0)}{selectedProduct.sku ? ` · ${selectedProduct.sku}` : ""}</p><small>{formatSnapshotLabel(selectedProduct.collectedAt)}</small></div>
            {desk.status === "ready" ? <dl className="campaign-copy">
              <div><dt>Mở đầu</dt><dd>{desk.result.content.hook}</dd></div>
              <div><dt>Chú thích</dt><dd>{desk.result.content.caption}</dd></div>
              <div><dt>Kêu gọi</dt><dd>{desk.result.content.cta}</dd></div>
            </dl> : <p className="script-guidance">Nội dung chỉ dùng giá, SKU và thông tin trong bản chụp catalog công khai đã chọn.</p>}
            <button className="primary-action" type="button" disabled={desk.status === "creating"} onClick={() => void createVideo()}>{desk.status === "creating" ? "Đang tạo video…" : desk.status === "error" ? "Thử tạo lại" : desk.status === "artifact_error" ? "Tạo lại video" : "Tạo video 12 giây"}</button>
            {desk.status === "creating" && <p className="operation-note" role="status">{desk.stage ? stageLabels[desk.stage] : "Đang chờ máy chủ ghi nhận tác vụ."}</p>}
            {desk.status === "error" && <p className="operation-note operation-note--error" role="alert">{desk.message}</p>}
            {desk.status === "artifact_error" && <p className="operation-note operation-note--error" role="alert">Không thể mở thành phẩm đã lưu. Hãy tạo lại video.</p>}
          </>}
        </section>

        <section className="desk-panel output-panel" aria-labelledby="output-title">
          <div className="panel-heading"><div><p className="panel-index">03</p><h2 id="output-title">Thành phẩm</h2></div></div>
          {desk.status === "ready" ? <div className="video-result">
            <video controls preload="metadata" src={desk.result.urls.video} onError={() => dispatch({ type: "artifact_failure", token: desk.operation.token })}>Trình duyệt của bạn không hỗ trợ phát video.</video>
            <div className="video-result__footer"><div><strong>Video dọc · 12 giây</strong><span>MP4 đã lưu cục bộ</span></div><button className="download-action" type="button" onClick={() => void downloadVideo()}>Tải video</button></div>
          </div> : <div className="output-placeholder" aria-hidden="true"><span className="frame-corner frame-corner--top" /><span>1080 × 1920</span><i /><p>Video hoàn chỉnh sẽ xuất hiện tại đây.</p><span className="frame-corner frame-corner--bottom" /></div>}
        </section>
      </div>
      <footer className="studio-footer"><span>Nguồn: bản chụp catalog công khai</span><a href="/api/health">Kiểm tra hệ thống</a></footer>
    </div>
  );
}
