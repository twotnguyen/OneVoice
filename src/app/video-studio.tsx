// SPDX-License-Identifier: Apache-2.0

"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";

import type { RenderStage } from "@/lib/render/types";
import {
  checkDownloadArtifact,
  initialStudioState,
  isQueuedRenderResponse,
  isSucceededRenderResponse,
  isValidRenderId,
  newStudioUuid,
  nextPollDelayMs,
  parseRunningStage,
  readJsonBody,
  safeRenderMessage,
  STUDIO_POLL_TOTAL_TIMEOUT_MS,
  StudioOperationController,
  studioQueryString,
  studioReducer,
} from "./video-studio-state";

type StudioProduct = Readonly<{
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  priceVnd: number;
  currency: string;
  stockQuantity: number | null;
  inStock?: boolean;
  primaryImageUrl?: string | null;
  keySpecs?: readonly string[];
  collectedAt: string | null;
}>;

type PriceRange = "all" | "under-15" | "15-25" | "25-35" | "above-35";

const PRICE_RANGES: readonly { id: PriceRange; label: string; min?: number; max?: number }[] = [
  { id: "all", label: "Tất cả giá" },
  { id: "under-15", label: "< 15 triệu", max: 15_000_000 },
  { id: "15-25", label: "15 - 25 triệu", min: 15_000_000, max: 25_000_000 },
  { id: "25-35", label: "25 - 35 triệu", min: 25_000_000, max: 35_000_000 },
  { id: "above-35", label: "> 35 triệu", min: 35_000_000 },
];
type CategoryTab = Readonly<{
  id: string;
  label: string;
  count: number;
}>;

const CATEGORY_TABS: readonly CategoryTab[] = [
  { id: "all", label: "🌟 Tất cả", count: 3977 },
  { id: "keyboard", label: "⌨️ Bàn phím", count: 527 },
  { id: "gpu", label: "🎮 Card đồ họa", count: 456 },
  { id: "monitor", label: "🖥️ Màn hình", count: 308 },
  { id: "mouse", label: "🖱️ Chuột", count: 247 },
  { id: "laptop", label: "💻 Laptop", count: 244 },
  { id: "mainboard", label: "⚙️ Mainboard", count: 227 },
  { id: "headset", label: "🎧 Tai nghe", count: 194 },
  { id: "furniture", label: "🪑 Bàn/Ghế", count: 104 },
  { id: "pc", label: "🖥️ PC bộ", count: 76 },
];

type ProductsResponse = Readonly<{
  items: readonly StudioProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>;

const PAGE_SIZE = 18;
const BRANDS_BY_CATEGORY: Record<string, readonly string[]> = {
  all: ["ASUS", "MSI", "GIGABYTE", "ACER", "Razer", "Logitech", "AULA", "Corsair"],
  keyboard: ["AULA", "Logitech", "ASUS", "Leobog", "AKKO", "DareU", "Razer", "HyperWork"],
  gpu: ["MSI", "GIGABYTE", "ASUS", "Zotac", "SPARKLE"],
  monitor: ["ASUS", "ViewSonic", "AOC", "LG", "MSI", "ACER", "Samsung", "E-Dra"],
  mouse: ["Logitech", "Razer", "ASUS", "AKKO", "HyperWork", "DareU"],
  laptop: ["ACER", "ASUS", "GIGABYTE", "DELL", "MSI", "LENOVO", "LG", "HP"],
  mainboard: ["ASUS", "MSI", "GIGABYTE"],
  headset: ["Razer", "HyperX", "Logitech", "AKKO", "DareU"],
  furniture: ["Razer", "Warrior", "E-Dra", "Corsair", "HyperWork", "Sihoo"],
  pc: ["GEARVN", "MSI", "ACER"],
};
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

const stageLabels: Record<RenderStage, string> = {
  loading_product: "Đang tải bản chụp sản phẩm",
  generating_content: "Đang tạo kịch bản AI",
  resolving_asset: "Đang xử lý ảnh sản phẩm",
  synthesizing_voice: "Đang tạo giọng đọc AI",
  composing_scenes: "Đang dựng từng phân cảnh",
  rendering_video: "Đang render video MP4",
  storing_artifact: "Đang lưu trữ thành phẩm",
};

export function VideoStudio() {
  const [products, setProducts] = useState<readonly StudioProduct[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const category = new URLSearchParams(window.location.search).get("category");
    return category && CATEGORY_TABS.some((item) => item.id === category) ? category : "all";
  });
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRange>("all");
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);
  const [selectedVoice, setSelectedVoice] = useState<string>("vi-VN-HoaiMyNeural");
  const [copiedSocial, setCopiedSocial] = useState<boolean>(false);
  const [campaignFormat, setCampaignFormat] = useState<"post" | "video">("video");
  const [campaignRevision, setCampaignRevision] = useState(0);
  const [campaignPost, setCampaignPost] = useState<{ hook: string; caption: string; cta: string } | null>(null);
  const [campaignNotice, setCampaignNotice] = useState("");
  const [campaignHistory, setCampaignHistory] = useState<readonly unknown[]>([]);
  const [slotStatus, setSlotStatus] = useState("");
  const [studio, dispatch] = useReducer(studioReducer, initialStudioState);
  const operationController = useRef(new StudioOperationController());
  const { selectedId, slotId, desk } = studio;

  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollId = useId();
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbRatio, setThumbRatio] = useState(0.3);
  const isDraggingThumb = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const isDraggingTabs = useRef(false);
  const tabsStartX = useRef(0);
  const tabsStartScrollLeft = useRef(0);

  const activeBrands = BRANDS_BY_CATEGORY[selectedCategory] || BRANDS_BY_CATEGORY.all;

  const updateScrollProgress = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 0) {
      setScrollProgress(el.scrollLeft / maxScroll);
      setThumbRatio(Math.max(0.2, el.clientWidth / el.scrollWidth));
    } else {
      setScrollProgress(0);
      setThumbRatio(1);
    }
  }, []);

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    updateScrollProgress();
    el.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      el.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, [updateScrollProgress]);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingThumb.current = true;
    dragStartX.current = e.clientX;
    const el = categoryScrollRef.current;
    dragStartScrollLeft.current = el ? el.scrollLeft : 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingThumb.current) return;
      const el = categoryScrollRef.current;
      const track = sliderTrackRef.current;
      if (!el || !track) return;
      const deltaX = moveEvent.clientX - dragStartX.current;
      const trackWidth = track.clientWidth;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const scrollDelta = (deltaX / trackWidth) * el.scrollWidth;
      el.scrollLeft = Math.max(0, Math.min(maxScroll, dragStartScrollLeft.current + scrollDelta));
    };

    const handleMouseUp = () => {
      isDraggingThumb.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const track = sliderTrackRef.current;
    const el = categoryScrollRef.current;
    if (!track || !el) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: ratio * maxScroll, behavior: "smooth" });
  }, []);

  const handleTabsMouseDown = useCallback((e: React.MouseEvent) => {
    const el = categoryScrollRef.current;
    if (!el) return;
    isDraggingTabs.current = true;
    tabsStartX.current = e.clientX;
    tabsStartScrollLeft.current = el.scrollLeft;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingTabs.current) return;
      const deltaX = moveEvent.clientX - tabsStartX.current;
      el.scrollLeft = tabsStartScrollLeft.current - deltaX;
    };

    const handleMouseUp = () => {
      isDraggingTabs.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const timer = setTimeout(() => {
      setCatalogState("loading");
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const loadProducts = useCallback((
    pageToLoad: number,
    signal: AbortSignal | undefined,
    s: string,
    brand: string | null,
    cat: string,
    pr: PriceRange,
    stock: boolean,
  ) => {
    let url = `/api/products?page=${pageToLoad}&pageSize=${PAGE_SIZE}`;
    if (cat && cat !== "all") {
      url += `&productType=${encodeURIComponent(cat)}`;
    } else {
      url += `&productType=all`;
    }
    if (brand) {
      url += `&brand=${encodeURIComponent(brand)}`;
    }
    if (s && s.trim()) {
      url += `&search=${encodeURIComponent(s.trim())}`;
    }
    const priceCfg = PRICE_RANGES.find((p) => p.id === pr);
    if (priceCfg?.min !== undefined) {
      url += `&minPrice=${priceCfg.min}`;
    }
    if (priceCfg?.max !== undefined) {
      url += `&maxPrice=${priceCfg.max}`;
    }
    if (stock) {
      url += `&inStockOnly=true`;
    }
    return fetch(url, signal ? { signal } : undefined)
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        const payload = (await readJsonBody(response)) as ProductsResponse | null;
        if (signal?.aborted) return;
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
        if (!signal?.aborted && error.name !== "AbortError") setCatalogState("error");
      });
  }, []);

  const reloadProducts = useCallback(() => {
    setCatalogState("loading");
    void loadProducts(page, undefined, debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly);
  }, [loadProducts, page, debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly]);

  const goToPage = useCallback((nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setCatalogState("loading");
    void loadProducts(nextPage, undefined, debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly);
  }, [loadProducts, page, totalPages, debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly]);

  const handleBrandClick = useCallback((brand: string | null) => {
    const nextBrand = brand === null ? null : selectedBrand === brand ? null : brand;
    if (nextBrand === selectedBrand) {
      if (page !== 1) {
        setCatalogState("loading");
        void loadProducts(1, undefined, debouncedSearch, nextBrand, selectedCategory, selectedPriceRange, inStockOnly);
      }
      return;
    }
    setCatalogState("loading");
    setSelectedBrand(nextBrand);
  }, [selectedBrand, page, loadProducts, debouncedSearch, selectedCategory, selectedPriceRange, inStockOnly]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    if (categoryId === selectedCategory) return;
    setCatalogState("loading");
    setSelectedCategory(categoryId);
    const brandsForCat = BRANDS_BY_CATEGORY[categoryId] || BRANDS_BY_CATEGORY.all;
    if (selectedBrand && !brandsForCat.includes(selectedBrand)) {
      setSelectedBrand(null);
    }
  }, [selectedBrand, selectedCategory]);

  const handlePriceRangeClick = useCallback((rangeId: PriceRange) => {
    if (rangeId === selectedPriceRange) return;
    setCatalogState("loading");
    setSelectedPriceRange(rangeId);
  }, [selectedPriceRange]);

  const handleInStockToggle = useCallback((checked: boolean) => {
    if (checked === inStockOnly) return;
    setCatalogState("loading");
    setInStockOnly(checked);
  }, [inStockOnly]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(1, controller.signal, debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly);
    return () => controller.abort();
  }, [debouncedSearch, selectedBrand, selectedCategory, selectedPriceRange, inStockOnly, loadProducts]);

  useEffect(() => {
    const operations = operationController.current;
    return () => operations.dispose();
  }, []);

  const persistLocation = useCallback((next: { selectedId?: string | null; slotId?: string | null; renderId?: string | null }) => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}${studioQueryString({ ...next, category: selectedCategory })}`);
  }, [selectedCategory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("selectedId");
    const slot = params.get("slotId");
    const render = params.get("renderId");
    const controller = new AbortController();
    if (slot && isValidRenderId(slot)) {
      dispatch({ type: "select_slot", slotId: slot });
      void (async () => {
        try {
          const query = render && isValidRenderId(render) ? `slotId=${slot}&renderId=${render}` : `slotId=${slot}`;
          const response = await fetch(`/api/studio?${query}`, { cache: "no-store", signal: controller.signal });
          const payload = await readJsonBody(response);
          if (!response.ok || !payload || typeof payload !== "object") return;
          const revision = "contentRevision" in payload && typeof payload.contentRevision === "number" ? payload.contentRevision : 0;
          setCampaignRevision(revision);
          let post = { hook: "", caption: "", cta: "" };
          if ("post" in payload && payload.post && typeof payload.post === "object") {
            const value = payload.post as { hook?: unknown; caption?: unknown; cta?: unknown };
            if (typeof value.hook === "string" && typeof value.caption === "string" && typeof value.cta === "string") {
              post = { hook: value.hook, caption: value.caption, cta: value.cta };
              setCampaignPost(post);
            }
          }
          if ("voiceId" in payload && typeof payload.voiceId === "string" && payload.voiceId) setSelectedVoice(payload.voiceId);
          if ("slotStatus" in payload && typeof payload.slotStatus === "string") setSlotStatus(payload.slotStatus);
          if ("history" in payload && Array.isArray(payload.history)) setCampaignHistory(payload.history);
          const urls = "urls" in payload && payload.urls && typeof payload.urls === "object" ? payload.urls as { status?: unknown; video?: unknown; download?: unknown } : null;
          const renderId = "artifactRenderId" in payload && typeof payload.artifactRenderId === "string" ? payload.artifactRenderId : null;
          if (renderId && isValidRenderId(renderId) && urls && typeof urls.status === "string" && typeof urls.video === "string" && typeof urls.download === "string") {
            dispatch({
              type: "resume",
              slotId: slot,
              operation: { token: "resume", renderId, productId: slot, slotId: slot },
              result: { renderId, status: "succeeded", content: post, urls: { status: urls.status, video: urls.video, download: urls.download } },
            });
          }
        } catch {
          if (!controller.signal.aborted) setCampaignNotice("Không tải được nội dung đã lưu. Hãy thử lại.");
        }
      })();
      return () => controller.abort();
    }
    if (selected && isValidRenderId(selected)) {
      dispatch({ type: "select", productId: selected });
      if (render && isValidRenderId(render)) {
        void (async () => {
          try {
            const response = await fetch(`/api/renders/${render}`, { cache: "no-store", signal: controller.signal });
            const payload = await readJsonBody(response);
            if (response.ok && isSucceededRenderResponse(payload) && payload.renderId === render) {
              dispatch({
                type: "resume",
                selectedId: selected,
                operation: { token: "resume", renderId: payload.renderId, productId: selected },
                result: payload,
              });
            }
          } catch {
            if (!controller.signal.aborted) return;
          }
        })();
      }
    }
    return () => controller.abort();
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

    try {
      const response = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderId: operation.renderId, productId: operation.productId, voiceId: selectedVoice }),
        signal: controller.signal,
      });
      const payload = await readJsonBody(response);
      const errorCode = payload !== null && typeof payload === "object" && "error" in payload &&
        payload.error !== null && typeof payload.error === "object" && "code" in payload.error &&
        typeof payload.error.code === "string"
        ? payload.error.code
        : undefined;

      if (!response.ok || !isQueuedRenderResponse(payload) || payload.renderId !== operation.renderId) {
        dispatch({ type: "start", operation });
        dispatch({ type: "failure", token: operation.token, message: safeRenderMessage(errorCode) });
        controller.abort();
        operationController.current.finish(controller);
        return;
      }
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: "start", operation });
        dispatch({ type: "failure", token: operation.token, message: "Mất kết nối với máy dựng. Kiểm tra hệ thống rồi thử lại." });
      }
      controller.abort();
      operationController.current.finish(controller);
      return;
    }

    dispatch({ type: "start", operation });
    persistLocation({ selectedId, renderId: operation.renderId });
    let settled = false;
    const pollStartedAt = Date.now();
    void (async () => {
      let attempt = 0;
      try {
        while (!settled && !controller.signal.aborted) {
          if (Date.now() - pollStartedAt > STUDIO_POLL_TOTAL_TIMEOUT_MS) {
            dispatch({ type: "failure", token: operation.token, message: "Quá thời gian dựng video. Kiểm tra hệ thống rồi thử lại." });
            settled = true;
            return;
          }

          const delay = nextPollDelayMs(attempt);
          attempt += 1;
          await new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, delay);
            controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
          });

          if (settled || controller.signal.aborted) return;

          try {
            const response = await fetch(`/api/renders/${operation.renderId}`, { signal: controller.signal, cache: "no-store" });
            if (response.ok) {
              const body = await readJsonBody(response);
              if (body !== null && typeof body === "object" && "status" in body) {
                if (body.status === "succeeded" && isSucceededRenderResponse(body)) {
                  dispatch({ type: "success", token: operation.token, result: body });
                  settled = true;
                  return;
                }
                if (body.status === "failed") {
                  const errorCode = "error" in body && body.error !== null && typeof body.error === "object" && "code" in body.error && typeof body.error.code === "string"
                    ? body.error.code
                    : undefined;
                  dispatch({ type: "failure", token: operation.token, message: safeRenderMessage(errorCode) });
                  settled = true;
                  return;
                }
                const stage = parseRunningStage(body);
                if (stage) {
                  dispatch({ type: "progress", token: operation.token, stage });
                }
              }
            }
          } catch {
            if (controller.signal.aborted) return;
          }
        }
      } finally {
        settled = true;
        controller.abort();
        operationController.current.finish(controller);
      }
    })();
  }

  async function generateCampaignSlot() {
    if (!slotId || desk.status === "creating") return;
    const requestId = newStudioUuid();
    const operation = { token: newStudioUuid(), renderId: newStudioUuid(), productId: slotId, slotId, requestId, voiceId: selectedVoice };
    const controller = operationController.current.start();
    if (!controller) return;
    setCampaignNotice("");
    try {
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          slotId,
          requestId,
          expectedContentRevision: campaignRevision,
          format: campaignFormat,
          voiceId: selectedVoice,
        }),
        signal: controller.signal,
      });
      const payload = await readJsonBody(response);
      if (!response.ok || !payload || typeof payload !== "object") {
        const code = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "code" in payload.error && typeof payload.error.code === "string" ? payload.error.code : undefined;
        setCampaignNotice(code === "VALIDATION" ? "Nội dung có giá hoặc thông tin không khớp dữ liệu đã xác thực. Hãy sửa rồi thử lại." : safeRenderMessage(code));
        controller.abort();
        operationController.current.finish(controller);
        return;
      }
      const post = "post" in payload && payload.post && typeof payload.post === "object" ? payload.post as { hook?: unknown; caption?: unknown; cta?: unknown } : null;
      if (post && typeof post.hook === "string" && typeof post.caption === "string" && typeof post.cta === "string") setCampaignPost({ hook: post.hook, caption: post.caption, cta: post.cta });
      if ("version" in payload && typeof payload.version === "number") setCampaignRevision(payload.version);
      const renderId = "renderId" in payload && typeof payload.renderId === "string" && isValidRenderId(payload.renderId) ? payload.renderId : null;
      persistLocation({ slotId, renderId });
      if (!renderId || campaignFormat === "post") {
        controller.abort();
        operationController.current.finish(controller);
        return;
      }
      const queued = { ...operation, renderId };
      dispatch({ type: "start", operation: queued });
      let settled = false;
      const pollStartedAt = Date.now();
      void (async () => {
        let attempt = 0;
        try {
          while (!settled && !controller.signal.aborted) {
            if (Date.now() - pollStartedAt > STUDIO_POLL_TOTAL_TIMEOUT_MS) {
              dispatch({ type: "failure", token: queued.token, message: "Quá thời gian dựng video. Kiểm tra hệ thống rồi thử lại." });
              settled = true;
              return;
            }
            const delay = nextPollDelayMs(attempt);
            attempt += 1;
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, delay);
              controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
            });
            if (settled || controller.signal.aborted) return;
            try {
              const status = await fetch(`/api/renders/${queued.renderId}`, { signal: controller.signal, cache: "no-store" });
              if (!status.ok) continue;
              const body = await readJsonBody(status);
              if (body !== null && typeof body === "object" && "status" in body) {
                if (body.status === "succeeded" && isSucceededRenderResponse(body)) {
                  dispatch({ type: "success", token: queued.token, result: body });
                  persistLocation({ slotId, renderId: body.renderId });
                  settled = true;
                  return;
                }
                if (body.status === "failed") {
                  dispatch({ type: "failure", token: queued.token, message: safeRenderMessage("error" in body && body.error && typeof body.error === "object" && "code" in body.error && typeof body.error.code === "string" ? body.error.code : undefined) });
                  settled = true;
                  return;
                }
                const stage = parseRunningStage(body);
                if (stage) dispatch({ type: "progress", token: queued.token, stage });
              }
            } catch {
              if (controller.signal.aborted) return;
            }
          }
        } finally {
          settled = true;
          controller.abort();
          operationController.current.finish(controller);
        }
      })();
    } catch {
      if (!controller.signal.aborted) setCampaignNotice("Mất kết nối khi sinh nội dung. Hãy thử lại.");
      controller.abort();
      operationController.current.finish(controller);
    }
  }

  async function saveCampaignEdit() {
    if (!slotId || !campaignPost || desk.status === "creating") return;
    setCampaignNotice("");
    const response = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        slotId,
        requestId: newStudioUuid(),
        expectedContentRevision: campaignRevision,
        post: campaignPost,
        voiceId: selectedVoice,
      }),
    });
    const payload = await readJsonBody(response);
    if (!response.ok) {
      const code = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "code" in payload.error && typeof payload.error.code === "string" ? payload.error.code : undefined;
      setCampaignNotice(code === "VALIDATION" ? "Nội dung có giá hoặc thông tin không khớp dữ liệu đã xác thực. Hãy sửa rồi thử lại." : "Không lưu được bản chỉnh sửa.");
      return;
    }
    if (payload && typeof payload === "object" && "version" in payload && typeof payload.version === "number") setCampaignRevision(payload.version);
    setCampaignNotice("Đã lưu bản chỉnh sửa.");
  }

  async function unscheduleCampaignSlot() {
    if (!slotId || desk.status === "creating") return;
    setCampaignNotice("");
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, requestId: newStudioUuid() }),
    });
    if (!response.ok) {
      setCampaignNotice("Không gỡ được lịch. Nội dung vẫn giữ.");
      return;
    }
    setCampaignNotice("Đã gỡ khung giờ. Nội dung vẫn giữ, chưa đăng.");
  }

  async function downloadVideo() {
    if (desk.status !== "ready" || !desk.result.urls.download) return;
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
      {/* Studio Header / Masthead */}
      <header className="studio-masthead">
        <div className="brand-lockup">
          <span className="brand-signal" aria-hidden="true" />
          <span className="brand-name">OneVoice AI Studio</span>
        </div>
        <div className="desk-status" aria-live="polite">
          <span className={`desk-status__light desk-status__light--${desk.status}`} aria-hidden="true" />
          <span>{operationLabel}</span>
        </div>
      </header>

      {/* Intro Hero Section */}
      <section className="studio-intro-hero" aria-labelledby="studio-title">
        <div className="studio-intro-hero__title">
          <h1 id="studio-title">Bàn Sản Xuất Video Bán Hàng Đa Kênh</h1>
          <p>Chọn sản phẩm từ 3.977 laptop, linh kiện, màn hình, bàn phím trong catalog công khai. AI tự động lập kịch bản, lồng tiếng tiếng Việt và dựng video dọc 9:16 lưu trữ cục bộ.</p>
        </div>
        <div className="studio-intro-hero__badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>HyperFrames AI Engine</span>
        </div>
      </section>

      {/* Modern 2-Column Balanced Workspace Grid */}
      <div className="studio-workspace-grid">
        {/* CỘT TRÁI: Kho sản phẩm (42%) */}
        <section className="studio-catalog-card" aria-labelledby="catalog-title">
          <header className="catalog-card-header">
            <h2 id="catalog-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span>Kho Sản Phẩm</span>
            </h2>
            {catalogState === "ready" && (
              <span className="catalog-count-pill">{totalCount} sản phẩm khả dụng</span>
            )}
          </header>

          <div className="catalog-filter-panel">
            {/* Category Navigation with Interactive Slider Track */}
            <div className="category-tabs-wrapper">
              <div
                className="category-tabs-scroll"
                ref={categoryScrollRef}
                id={categoryScrollId}
                role="tablist"
                aria-label="Chọn loại sản phẩm"
                onMouseDown={handleTabsMouseDown}
              >
                {CATEGORY_TABS.map((cat) => {
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "category-tab-btn category-tab-btn--active" : "category-tab-btn"}
                      onClick={() => handleCategoryClick(cat.id)}
                      disabled={desk.status === "creating"}
                    >
                      <span>{cat.label}</span>
                      <span className="category-tab-badge">{cat.count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Thanh kéo trượt tương tác (Draggable Slider Track) */}
              <div className="category-slider-container">
                <div
                  className="category-slider-track"
                  ref={sliderTrackRef}
                  onClick={handleTrackClick}
                  role="scrollbar"
                  tabIndex={0}
                  aria-controls={categoryScrollId}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(scrollProgress * 100)}
                  onKeyDown={(event) => {
                    const el = categoryScrollRef.current;
                    if (!el) return;
                    const maxScroll = el.scrollWidth - el.clientWidth;
                    const positions: Record<string, number> = {
                      ArrowLeft: el.scrollLeft - 40,
                      ArrowRight: el.scrollLeft + 40,
                      PageUp: el.scrollLeft - el.clientWidth,
                      PageDown: el.scrollLeft + el.clientWidth,
                      Home: 0,
                      End: maxScroll,
                    };
                    if (!(event.key in positions)) return;
                    event.preventDefault();
                    el.scrollTo({ left: Math.max(0, Math.min(maxScroll, positions[event.key])), behavior: "smooth" });
                  }}
                  aria-orientation="horizontal"
                  aria-label="Thanh kéo cuộn danh mục"
                >
                  <div
                    className="category-slider-thumb"
                    style={{
                      width: `${Math.round(thumbRatio * 100)}%`,
                      left: `${Math.round(scrollProgress * (1 - thumbRatio) * 100)}%`,
                    }}
                    onMouseDown={handleThumbMouseDown}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Search Input and In-Stock Toggle */}
            <div className="catalog-search-row">
              <div className="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="search"
                  className="catalog-search-input"
                  placeholder={`Tìm ${selectedCategory === "all" ? "3.977 sản phẩm" : CATEGORY_TABS.find((c) => c.id === selectedCategory)?.label || "sản phẩm"}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={desk.status === "creating"}
                  aria-label="Tìm theo tên máy, mã SKU"
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearch("")}
                    aria-label="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`stock-filter-pill ${inStockOnly ? "stock-filter-pill--active" : ""}`}
                onClick={() => handleInStockToggle(!inStockOnly)}
                disabled={desk.status === "creating"}
                aria-pressed={inStockOnly}
              >
                <span className="stock-badge-dot" aria-hidden="true" />
                <span>Chỉ còn hàng</span>
              </button>
            </div>

            {/* Row 3: Price Filter Pills */}
            <div className="price-filters-row" role="toolbar" aria-label="Lọc theo mức giá">
              <span className="filter-row-label">Mức giá:</span>
              {PRICE_RANGES.map((pr) => {
                const active = selectedPriceRange === pr.id;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    className={active ? "price-pill price-pill--active" : "price-pill"}
                    onClick={() => handlePriceRangeClick(pr.id)}
                    aria-pressed={active}
                    disabled={desk.status === "creating"}
                  >
                    {pr.label}
                  </button>
                );
              })}
            </div>

            {/* Row 4: Dynamic Brand Filter Pills */}
            <div className="brand-pills-row" role="toolbar" aria-label="Lọc theo thương hiệu">
              <span className="filter-row-label">Thương hiệu:</span>
              <button
                type="button"
                className={selectedBrand === null ? "brand-pill brand-pill--active" : "brand-pill"}
                onClick={() => handleBrandClick(null)}
                aria-pressed={selectedBrand === null}
                disabled={desk.status === "creating"}
              >
                Tất cả
              </button>
              {activeBrands.map((brand) => {
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

          {/* Product Cards List */}
          {catalogState === "loading" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-muted)" }}>
              <p>Đang tải dữ liệu sản phẩm từ Supabase…</p>
            </div>
          )}

          {catalogState === "error" && (
            <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--danger)" }}>
              <p style={{ marginBottom: "10px", fontWeight: 600 }}>Không thể tải danh mục sản phẩm.</p>
              <button className="btn" type="button" onClick={reloadProducts}>Thử tải lại</button>
            </div>
          )}

          {catalogState === "empty" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-muted)" }}>
              <p>Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.</p>
            </div>
          )}

          {catalogState === "ready" && (
            <>
              <div className="product-card-list" aria-label="Danh sách sản phẩm">
                {products.map((product) => {
                  const selected = product.id === selectedId;
                  const meta = [product.brand, product.sku].filter(Boolean).join(" · ");
                  const formattedPrice = currency.format(product.priceVnd ?? 0);
                  const ariaLabel = `${product.name}${meta ? ` · ${meta}` : ""}${formattedPrice ? ` · ${formattedPrice}` : ""}`;
                  const isInStock = product.inStock !== false;
                  const stockQty = product.stockQuantity;
                  const specs = product.keySpecs || [];

                  return (
                    <button
                      className="product-card-item"
                      data-selected={selected || undefined}
                      aria-pressed={selected}
                      aria-label={ariaLabel}
                      title={product.name}
                      disabled={desk.status === "creating"}
                      key={product.id}
                      type="button"
                      onClick={() => {
                        dispatch({ type: "select", productId: product.id });
                        persistLocation({ selectedId: product.id });
                      }}
                    >
                      <div className="product-card-marker" aria-hidden="true" />

                      <div className="product-card-thumb">
                        {product.primaryImageUrl ? (
                          <Image
                            unoptimized
                            width={64}
                            height={64}
                            src={product.primaryImageUrl}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="product-card-thumb-fallback">{product.brand || "PC"}</span>
                        )}
                      </div>

                      <div className="product-card-details">
                        <div className="product-card-top-line">
                          <span className="product-card-name">{product.name}</span>
                          <span className={`stock-badge ${isInStock ? "stock-badge--in" : "stock-badge--out"}`}>
                            <span className="stock-badge-dot" aria-hidden="true" />
                            {isInStock ? (stockQty ? `Còn hàng (${stockQty})` : "Còn hàng") : "Hết hàng"}
                          </span>
                        </div>

                        {specs.length > 0 && (
                          <div className="product-card-specs" aria-label="Thông số nổi bật">
                            {specs.map((spec, i) => (
                              <span key={i} className="spec-chip">{spec}</span>
                            ))}
                          </div>
                        )}

                        <div className="product-card-bottom-line">
                          <span className="product-card-price">{formattedPrice}</span>
                          <span className="product-card-meta">{meta || "Chưa có SKU"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination */}
              <nav className="catalog-pagination-bar" aria-label="Phân trang danh mục">
                <button
                  className="pagination-btn"
                  type="button"
                  disabled={page <= 1 || desk.status === "creating"}
                  onClick={() => goToPage(page - 1)}
                >
                  ← Trước
                </button>
                <span className="pagination-info">
                  Trang {page} / {totalPages} · Tổng {totalCount} máy
                </span>
                <button
                  className="pagination-btn"
                  type="button"
                  disabled={page >= totalPages || desk.status === "creating"}
                  onClick={() => goToPage(page + 1)}
                >
                  Sau →
                </button>
              </nav>
            </>
          )}
        </section>

        {/* CỘT PHẢI: Bàn biên tập & Preview Player (58%) */}
        <div className="studio-canvas-deck">
          {/* Section 1: Hero Selected Product */}
          {slotId && (
            <div className="script-canvas-card" style={{ marginBottom: "16px" }}>
              <div className="script-canvas-header">
                <h3>Chiến dịch · khung nội dung</h3>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>Bản {campaignRevision}</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)", marginBottom: "12px" }}>Sinh bài viết hoặc kịch bản từ slot đã lưu. Không duyệt từng bài. Tải lại giữ slot/render đã persist.</p>
              <div className="voice-selector-row">
                <span className="filter-row-label">Định dạng:</span>
                <select className="voice-select" aria-label="Định dạng nội dung" value={campaignFormat} disabled={desk.status === "creating"} onChange={(e) => setCampaignFormat(e.target.value === "post" ? "post" : "video")}>
                  <option value="video">Video</option>
                  <option value="post">Bài viết</option>
                </select>
              </div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "8px" }}>Hook
                <textarea aria-label="Hook" value={campaignPost?.hook ?? ""} onChange={(e) => setCampaignPost({ hook: e.target.value, caption: campaignPost?.caption ?? "", cta: campaignPost?.cta ?? "" })} rows={2} style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "8px" }}>Caption
                <textarea aria-label="Caption" value={campaignPost?.caption ?? ""} onChange={(e) => setCampaignPost({ hook: campaignPost?.hook ?? "", caption: e.target.value, cta: campaignPost?.cta ?? "" })} rows={4} style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "8px" }}>CTA
                <textarea aria-label="CTA" value={campaignPost?.cta ?? ""} onChange={(e) => setCampaignPost({ hook: campaignPost?.hook ?? "", caption: campaignPost?.caption ?? "", cta: e.target.value })} rows={2} style={{ width: "100%" }} />
              </label>
              {campaignNotice && <p role="status" style={{ color: "var(--danger)", fontSize: "0.82rem" }}>{campaignNotice}</p>}
              <div className="canvas-action-row">
                <button className="btn-create-video" type="button" disabled={desk.status === "creating"} onClick={() => void generateCampaignSlot()}>Sinh nội dung</button>
                <button className="btn" type="button" disabled={desk.status === "creating" || !campaignPost} onClick={() => void saveCampaignEdit()}>Lưu chỉnh sửa</button>
                <button className="btn" type="button" disabled={desk.status === "creating"} onClick={() => void unscheduleCampaignSlot()}>Gỡ lịch</button>
              </div>
              {slotStatus ? <p style={{ fontSize: "0.82rem", marginTop: "8px" }}>Trạng thái khung: {slotStatus === "WAITING_CHANNEL" ? "Chờ kênh đăng" : slotStatus}</p> : null}
              {campaignHistory.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <h4 style={{ fontSize: "0.85rem" }}>Lịch sử phiên bản</h4>
                  {campaignHistory.map((row, index) => {
                    if (!row || typeof row !== "object") return null;
                    const version = "version" in row && typeof row.version === "number" ? row.version : index + 1;
                    const caption = "caption" in row && typeof row.caption === "string" ? row.caption : "";
                    const hook = "hook" in row && typeof row.hook === "string" ? row.hook : "";
                    const hash = "artifactHash" in row && typeof row.artifactHash === "string" ? row.artifactHash : "";
                    const validation = "validation" in row && row.validation && typeof row.validation === "object" && "status" in row.validation && typeof row.validation.status === "string" ? row.validation.status : "";
                    const id = "id" in row && typeof row.id === "string" ? row.id : String(index);
                    return (
                      <p key={id} style={{ fontSize: "0.78rem" }}>
                        v{version} · {hook} · {caption} · Truth Guard {validation || "—"} · {hash ? `hash ${hash.slice(0, 12)}` : "chưa render"}
                        {hash ? <> · <a href={`/api/renders/${id}/download`}>Tải thành phẩm</a></> : null}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {selectedProduct ? (
            <div className="selected-hero-card">
              <div className="selected-hero-card__thumb">
                {selectedProduct.primaryImageUrl ? (
                  <Image unoptimized width={80} height={80} src={selectedProduct.primaryImageUrl} alt={selectedProduct.name} />
                ) : (
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink-muted)" }}>{selectedProduct.brand}</span>
                )}
              </div>
              <div className="selected-hero-card__info">
                <span className="selected-hero-card__kicker">Sản phẩm đang chọn</span>
                <h2 className="selected-hero-card__name" title={selectedProduct.name}>{selectedProduct.name}</h2>
                <div className="selected-hero-card__price-row">
                  <span className="selected-hero-card__price">{currency.format(selectedProduct.priceVnd ?? 0)}</span>
                  {selectedProduct.sku && <span className="spec-chip">{selectedProduct.sku}</span>}
                  {selectedProduct.keySpecs?.slice(0, 2).map((s, idx) => (
                    <span key={idx} className="spec-chip">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="selected-hero-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <strong style={{ fontSize: "0.95rem", color: "var(--ink-primary)" }}>Chưa chọn sản phẩm</strong>
              <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>Hãy bấm chọn một laptop từ danh sách bên trái để mở bàn sản xuất kịch bản.</p>
            </div>
          )}

          {/* Section 2: Creative Script Canvas */}
          <div className="script-canvas-card">
            <div className="script-canvas-header">
              <h3>02. Kịch Bản Video AI</h3>
              {desk.status === "ready" && (
                <span style={{ fontSize: "0.75rem", color: "var(--emerald)", fontWeight: 700 }}>
                  ✓ Đã đồng bộ âm thanh & video
                </span>
              )}
            </div>

            {/* Voice & Narration Options */}
            <div className="voice-selector-row">
              <span className="filter-row-label">Giọng đọc:</span>
              <select
                className="voice-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={desk.status === "creating"}
                aria-label="Chọn giọng đọc AI"
              >
                <option value="vi-VN-HoaiMyNeural">👩 Hoài My (Nữ miền Bắc · Truyền cảm)</option>
                <option value="vi-VN-NamMinhNeural">👨 Nam Minh (Nam miền Bắc · Dứt khoát)</option>
                <option value="vieneu">🤖 VieNeu-TTS (Local Engine)</option>
              </select>
            </div>
            {desk.status === "ready" ? (
              <>
                <div className="scene-cards-grid">
                  <div className="scene-card">
                    <div className="scene-card-header">
                      <span className="scene-card-title">⚡ Cảnh 1 · Mở Đầu (Hook)</span>
                      <span className="scene-card-duration">~4.0s</span>
                    </div>
                    <p className="scene-card-content">{desk.result.content.hook}</p>
                  </div>
                  <div className="scene-card">
                    <div className="scene-card-header">
                      <span className="scene-card-title">💡 Cảnh 2 · Thân Bài (Caption)</span>
                      <span className="scene-card-duration">~8.0s</span>
                    </div>
                    <p className="scene-card-content">{desk.result.content.caption}</p>
                  </div>
                  <div className="scene-card">
                    <div className="scene-card-header">
                      <span className="scene-card-title">🚀 Cảnh 3 · Kêu Gọi (CTA)</span>
                      <span className="scene-card-duration">~3.0s</span>
                    </div>
                    <p className="scene-card-content">{desk.result.content.cta}</p>
                  </div>
                </div>
                <button
                  className="btn-copy-social"
                  type="button"
                  onClick={() => {
                    if (desk.status !== "ready") return;
                    const copyText = `${desk.result.content.hook}\n\n${desk.result.content.caption}\n\n👉 ${desk.result.content.cta}\n\n#OneVoice #${selectedProduct?.brand || "CongNghe"} #VideoMarketing #Review`;
                    void navigator.clipboard.writeText(copyText).then(() => {
                      setCopiedSocial(true);
                      window.setTimeout(() => setCopiedSocial(false), 2000);
                    }).catch(() => {
                      setCampaignNotice("Không sao chép được. Hãy thử lại sau khi nội dung sẵn sàng.");
                    });
                  }}
                >
                  {copiedSocial ? "✓ Đã sao chép kịch bản & hashtags!" : "📋 Sao chép Caption & Hashtags TikTok"}
                </button>
              </>
            ) : (
              <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
                AI sẽ tự động sinh kịch bản gồm 3 phân cảnh chuẩn cấu trúc TikTok/Reels, đối chiếu và chuẩn hóa 100% số liệu từ catalog công khai của máy.
              </p>
            )}

            {/* Action Bar */}
            <div className="canvas-action-row">
              <button
                className="btn-create-video"
                type="button"
                disabled={!selectedId || desk.status === "creating"}
                onClick={() => void createVideo()}
              >
                {desk.status === "creating" ? (
                  <>
                    <span className="phone-spinner" style={{ width: "18px", height: "18px", borderWidth: "2px" }} />
                    <span>Đang render video…</span>
                  </>
                ) : desk.status === "error" ? (
                  "Thử tạo lại video"
                ) : desk.status === "artifact_error" ? (
                  "Tạo lại video"
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span>Bắt đầu dựng video AI</span>
                  </>
                )}
              </button>

              {desk.status === "creating" && (
                <div className="action-status-banner action-status-banner--creating" role="status">
                  <span className="desk-status__light desk-status__light--creating" />
                  <span>{desk.stage ? stageLabels[desk.stage] : "Đang kết nối hàng đợi worker…"}</span>
                </div>
              )}

              {desk.status === "error" && (
                <div className="action-status-banner action-status-banner--error" role="alert">
                  <span>{desk.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Phone Mockup Video Player */}
          <div className="phone-mockup-container">
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "16px", alignSelf: "flex-start" }}>
              03. Khung Xem Video Điện Thoại (9:16)
            </h3>

            <div className="phone-mockup-frame">
              <div className="phone-notch" />
              <div className="phone-screen">
                {desk.status === "ready" ? (
                  <video
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    src={desk.result.urls.video}
                    onError={() => dispatch({ type: "artifact_failure", token: desk.operation.token })}
                  >
                    Trình duyệt không hỗ trợ phát video.
                  </video>
                ) : desk.status === "creating" ? (
                  <div className="phone-rendering-state">
                    <div className="phone-spinner" />
                    <span className="phone-rendering-label">
                      {desk.stage ? stageLabels[desk.stage] : "Đang chuẩn bị render…"}
                    </span>
                  </div>
                ) : (
                  <div className="phone-idle-state">
                    <div className="phone-idle-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Video dọc 1080×1920</span>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Thành phẩm sau khi render sẽ xuất hiện tại đây.</span>
                  </div>
                )}
              </div>
            </div>

            {desk.status === "ready" && (
              <div className="phone-controls-row">
                <div className="phone-video-meta">
                  <strong>Video dọc MP4</strong>
                  <span>{desk.result.durationSeconds ? `${desk.result.durationSeconds} giây` : "Chuẩn định dạng"} · 1080×1920</span>
                </div>
                <button
                  className="btn-download-video"
                  type="button"
                  onClick={() => void downloadVideo()}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>Tải video MP4</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Studio Footer */}
      <footer className="studio-footer-bar">
        <span>Nguồn: Bản chụp catalog công khai · Xác thực 100% dữ liệu gốc</span>
        <a href="/api/health">Kiểm tra trạng thái hệ thống</a>
      </footer>
    </div>
  );
}
