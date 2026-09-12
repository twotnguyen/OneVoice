// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type VideoScriptContent = Readonly<{
  hook: string;
  caption: string;
  cta: string;
}>;

export type HistoryItem = Readonly<{
  renderId: string;
  productId: string | null;
  productName: string;
  brand: string | null;
  sku: string | null;
  priceVnd: number | null;
  status: "succeeded" | "failed" | string;
  errorStage: string | null;
  errorCode: string | null;
  videoDurationMs: number | null;
  videoBytes: number | null;
  createdAt: string;
  model: string | null;
  sceneCount: number | null;
  hasVideo: boolean;
  script: VideoScriptContent | null;
}>;

export type HistoryClientProps = Readonly<{
  items: readonly HistoryItem[];
}>;

function formatViDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(date);
  } catch {
    return isoString;
  }
}

function formatVnd(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDurationSeconds(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function HistoryClient({ items }: HistoryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "succeeded" | "failed">("all");
  const [modalItem, setModalItem] = useState<HistoryItem | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalItem(null);
      }
    }
    if (modalItem) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [modalItem]);

  const handleCopyId = useCallback((id: string) => {
    void navigator.clipboard.writeText(id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  }, []);

  const counts = useMemo(() => {
    const total = items.length;
    const succeeded = items.filter((i) => i.status === "succeeded").length;
    const failed = items.filter((i) => i.status === "failed").length;
    return { total, succeeded, failed };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (query) {
        const matchName = item.productName?.toLowerCase().includes(query) ?? false;
        const matchSku = item.sku?.toLowerCase().includes(query) ?? false;
        const matchRenderId = item.renderId.toLowerCase().includes(query);
        const matchBrand = item.brand?.toLowerCase().includes(query) ?? false;
        const matchHook = item.script?.hook?.toLowerCase().includes(query) ?? false;
        const matchCaption = item.script?.caption?.toLowerCase().includes(query) ?? false;
        return matchName || matchSku || matchRenderId || matchBrand || matchHook || matchCaption;
      }
      return true;
    });
  }, [items, searchQuery, statusFilter]);

  return (
    <div className="history-page-container">
      {/* Masthead */}
      <header className="page-masthead">
        <div className="page-masthead__title">
          <h1>Lịch Sử Sản Xuất Video</h1>
          <p>Theo dõi, phát lại và tải về các video TikTok đã tạo từ catalog sản phẩm OneVoice</p>
        </div>
        <div className="history-count-badge">
          <span className="count-num">{items.length}</span>
          <span className="count-label">tổng video</span>
        </div>
      </header>

      {/* Filter Bar */}
      <section className="history-filters-bar" aria-label="Bộ lọc lịch sử video">
        <div className="history-search-box">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="history-search-input"
            placeholder="Tìm theo tên sản phẩm, mã SKU, hoặc render ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Xóa tìm kiếm"
            >
              &times;
            </button>
          )}
        </div>

        <div className="history-status-pills" role="tablist" aria-label="Lọc theo trạng thái">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "all"}
            className={`status-pill-btn ${statusFilter === "all" ? "status-pill-btn--active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Tất cả
            <span className="pill-count">{counts.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "succeeded"}
            className={`status-pill-btn ${
              statusFilter === "succeeded" ? "status-pill-btn--active status-pill-btn--success" : ""
            }`}
            onClick={() => setStatusFilter("succeeded")}
          >
            <span className="pill-dot pill-dot--success" />
            Thành công (succeeded)
            <span className="pill-count">{counts.succeeded}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "failed"}
            className={`status-pill-btn ${
              statusFilter === "failed" ? "status-pill-btn--active status-pill-btn--danger" : ""
            }`}
            onClick={() => setStatusFilter("failed")}
          >
            <span className="pill-dot pill-dot--danger" />
            Thất bại (failed)
            <span className="pill-count">{counts.failed}</span>
          </button>
        </div>
      </section>

      {/* Grid of Cards */}
      {filteredItems.length === 0 ? (
        <div className="history-empty-deck">
          <div className="empty-icon-circle">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <path d="m10 15 5-3-5-3v6Z" />
            </svg>
          </div>
          <h3>Không tìm thấy bản ghi nào</h3>
          <p>
            {searchQuery || statusFilter !== "all"
              ? "Thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc trạng thái."
              : "Chưa có video nào được dựng trong hệ thống. Hãy truy cập Studio để tạo video đầu tiên!"}
          </p>
          {searchQuery || statusFilter !== "all" ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            >
              Đặt lại bộ lọc
            </button>
          ) : (
            <Link href="/" className="btn btn--primary">
              Đến Studio tạo video
            </Link>
          )}
        </div>
      ) : (
        <div className="history-grid">
          {filteredItems.map((item) => {
            const isSuccess = item.status === "succeeded";
            const retryHref = item.productId
              ? `/?selectedId=${encodeURIComponent(item.productId)}`
              : "/";

            return (
              <article key={item.renderId} className="history-card">
                {/* Video Preview / Poster */}
                <div className="history-card__video-preview">
                  {isSuccess && item.hasVideo ? (
                    <>
                      <video
                        src={`/api/renders/${item.renderId}/video`}
                        preload="metadata"
                        muted
                        playsInline
                        loop
                        onMouseEnter={(e) => {
                          e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      />
                      <div className="video-preview-overlay">
                        <button
                          type="button"
                          className="preview-play-btn"
                          onClick={() => setModalItem(item)}
                          aria-label="Xem video và kịch bản"
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </button>
                        {item.videoDurationMs != null && (
                          <span className="preview-duration-chip">
                            {formatDurationSeconds(item.videoDurationMs)}
                          </span>
                        )}
                      </div>
                    </>
                  ) : isSuccess && !item.hasVideo ? (
                    <div className="preview-placeholder preview-placeholder--archived">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="2" y="2" width="20" height="20" rx="3" />
                        <line x1="7" y1="2" x2="7" y2="22" />
                        <line x1="17" y1="2" x2="17" y2="22" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                      </svg>
                      <span>Tệp video đã lưu trữ / GC</span>
                    </div>
                  ) : (
                    <div className="preview-placeholder preview-placeholder--failed">
                      <div className="failed-badge-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <span className="failed-title">Render không thành công</span>
                      <code className="failed-code">{item.errorCode || "VIDEO_FAILED"}</code>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="history-card__body">
                  <div className="card-top-pills">
                    {isSuccess ? (
                      <span className="status-pill status-pill--success">
                        <span className="status-dot status-dot--success" />
                        Thành công
                      </span>
                    ) : (
                      <span
                        className="status-pill status-pill--danger"
                        title={item.errorCode ?? undefined}
                      >
                        <span className="status-dot status-dot--danger" />
                        {item.errorCode || "Lỗi xử lý"}
                      </span>
                    )}

                    {item.brand && <span className="brand-chip">{item.brand}</span>}
                  </div>

                  <h2 className="history-card__title" title={item.productName}>
                    {item.productName}
                  </h2>

                  {item.script?.hook && (
                    <p className="card-hook-quote" title={item.script.hook}>
                      &ldquo;{item.script.hook}&rdquo;
                    </p>
                  )}

                  <div className="history-card__meta-row">
                    <span className="meta-sku" title={item.sku ?? undefined}>
                      SKU: <strong>{item.sku || "—"}</strong>
                    </span>
                    <span className="meta-date">
                      <time dateTime={item.createdAt}>{formatViDateTime(item.createdAt)}</time>
                    </span>
                    {item.videoDurationMs != null && (
                      <span className="meta-duration">
                        {formatDurationSeconds(item.videoDurationMs)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="history-card__actions">
                  {isSuccess ? (
                    <>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setModalItem(item)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Xem video & Kịch bản</span>
                      </button>

                      <a
                        href={`/api/renders/${item.renderId}/download`}
                        download
                        className={`btn btn--primary btn--sm ${!item.hasVideo ? "btn--disabled" : ""}`}
                        title={item.hasVideo ? "Tải video MP4" : "Tệp video không khả dụng"}
                        onClick={(e) => {
                          if (!item.hasVideo) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Tải MP4</span>
                      </a>
                    </>
                  ) : (
                    <>
                      <Link href={retryHref} className="btn btn--primary btn--sm">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                        </svg>
                        <span>Thử tạo lại</span>
                      </Link>

                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setModalItem(item)}
                      >
                        <span>Xem chi tiết</span>
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Player & Full Script Detail */}
      {modalItem && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModalItem(null);
            }
          }}
        >
          <div className="modal-dialog">
            {/* Modal Header */}
            <header className="modal-dialog__header">
              <div className="modal-header-info">
                <div className="modal-header-tag-row">
                  {modalItem.status === "succeeded" ? (
                    <span className="status-pill status-pill--success">
                      <span className="status-dot status-dot--success" />
                      Thành công
                    </span>
                  ) : (
                    <span className="status-pill status-pill--danger">
                      <span className="status-dot status-dot--danger" />
                      {modalItem.errorCode || "Thất bại"}
                    </span>
                  )}
                  {modalItem.brand && <span className="brand-chip">{modalItem.brand}</span>}
                </div>
                <h2 id="modal-detail-title">{modalItem.productName}</h2>
                <div className="modal-id-row">
                  <span className="modal-id-label">Render ID:</span>
                  <code>{modalItem.renderId}</code>
                  <button
                    type="button"
                    className="btn-copy-id"
                    onClick={() => handleCopyId(modalItem.renderId)}
                    title="Sao chép ID"
                  >
                    {copiedId ? "Đã chép!" : "Chép ID"}
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalItem(null)}
                aria-label="Đóng cửa sổ"
              >
                &times;
              </button>
            </header>

            {/* Modal Body */}
            <div className="modal-dialog__body">
              {/* Left Column: Video Player */}
              <div className="modal-video-column">
                <div className="modal-player-wrapper">
                  {modalItem.status === "succeeded" && modalItem.hasVideo ? (
                    <video
                      controls
                      autoPlay
                      playsInline
                      src={`/api/renders/${modalItem.renderId}/video`}
                      className="modal-video-player"
                    />
                  ) : modalItem.status === "succeeded" && !modalItem.hasVideo ? (
                    <div className="modal-player-placeholder">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="2" y="2" width="20" height="20" rx="3" />
                        <line x1="7" y1="2" x2="7" y2="22" />
                        <line x1="17" y1="2" x2="17" y2="22" />
                      </svg>
                      <p>Tệp video không còn trên máy chủ lưu trữ (đã được dọn dẹp theo chính sách lưu trữ).</p>
                    </div>
                  ) : (
                    <div className="modal-player-placeholder modal-player-placeholder--failed">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <h4>Tiến trình dựng video thất bại</h4>
                      <p>Giai đoạn: <strong>{modalItem.errorStage || "Không xác định"}</strong></p>
                      <code>{modalItem.errorCode || "RENDER_FAILED"}</code>
                    </div>
                  )}
                </div>

                {modalItem.status === "succeeded" && (
                  <div className="modal-player-actions">
                    <a
                      href={`/api/renders/${modalItem.renderId}/download`}
                      download
                      className={`btn btn--primary ${!modalItem.hasVideo ? "btn--disabled" : ""}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Tải MP4 chất lượng cao
                    </a>
                  </div>
                )}
              </div>

              {/* Right Column: Script & Metadata */}
              <div className="modal-details-column">
                {/* 3-Scene Script */}
                <div className="modal-section">
                  <h3 className="modal-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Kịch Bản Video 3 Cảnh (TikTok Form)
                  </h3>

                  {modalItem.script ? (
                    <div className="scene-cards-grid">
                      {/* Scene 1: Hook */}
                      <div className="scene-card">
                        <div className="scene-card-header">
                          <span className="scene-card-title">Cảnh 1: Mở Đầu (Hook)</span>
                          <span className="scene-card-duration">0s - 3s</span>
                        </div>
                        <p className="scene-card-content">{modalItem.script.hook}</p>
                      </div>

                      {/* Scene 2: Caption */}
                      <div className="scene-card">
                        <div className="scene-card-header">
                          <span className="scene-card-title">Cảnh 2: Thân Bài (Key Features)</span>
                          <span className="scene-card-duration">3s - 9s</span>
                        </div>
                        <p className="scene-card-content">{modalItem.script.caption}</p>
                      </div>

                      {/* Scene 3: CTA */}
                      <div className="scene-card">
                        <div className="scene-card-header">
                          <span className="scene-card-title">Cảnh 3: Kêu Gọi Hành Động (CTA)</span>
                          <span className="scene-card-duration">9s - 12s</span>
                        </div>
                        <p className="scene-card-content">{modalItem.script.cta}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-script-box">
                      <p>Kịch bản nội dung không được lưu trữ trong bản ghi này.</p>
                    </div>
                  )}
                </div>

                {/* Metadata Ledger */}
                <div className="modal-section">
                  <h3 className="modal-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Thông Số Kỹ Thuật Video
                  </h3>

                  <dl className="metadata-ledger-grid">
                    <div className="ledger-item">
                      <dt>Mã SKU</dt>
                      <dd><code>{modalItem.sku || "—"}</code></dd>
                    </div>
                    <div className="ledger-item">
                      <dt>Giá niêm yết</dt>
                      <dd><strong>{formatVnd(modalItem.priceVnd)}</strong></dd>
                    </div>
                    <div className="ledger-item">
                      <dt>Thời lượng video</dt>
                      <dd>{formatDurationSeconds(modalItem.videoDurationMs)}</dd>
                    </div>
                    <div className="ledger-item">
                      <dt>Dung lượng file</dt>
                      <dd>{formatBytes(modalItem.videoBytes)}</dd>
                    </div>
                    <div className="ledger-item">
                      <dt>AI Model</dt>
                      <dd><code>{modalItem.model || "standard"}</code></dd>
                    </div>
                    <div className="ledger-item">
                      <dt>Số cảnh</dt>
                      <dd>{modalItem.sceneCount ?? 3}</dd>
                    </div>
                    <div className="ledger-item full-width">
                      <dt>Thời gian tạo</dt>
                      <dd>{formatViDateTime(modalItem.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoped CSS for Modern Studio Pro design refinement */}
      <style jsx>{`
        .history-page-container {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .history-count-badge {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          padding: 6px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-full);
          box-shadow: var(--shadow-xs);
        }
        .count-num {
          font-weight: 800;
          font-size: var(--text-lg);
          color: var(--brand-primary);
        }
        .count-label {
          font-size: var(--text-xs);
          color: var(--ink-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .history-search-box {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1;
          max-width: 460px;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          color: var(--ink-subtle);
          pointer-events: none;
        }
        .history-search-input {
          width: 100%;
          height: 40px;
          padding: 8px 36px 8px 40px;
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
          font-size: var(--text-sm);
          color: var(--ink-primary);
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .history-search-input:focus {
          outline: none;
          background: var(--bg-surface);
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 3px var(--brand-primary-subtle);
        }
        .search-clear-btn {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          font-size: 1.25rem;
          line-height: 1;
          color: var(--ink-muted);
          cursor: pointer;
          padding: 4px;
        }

        .history-status-pills {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .status-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--ink-secondary);
          background: var(--bg-subtle);
          border: 1px solid var(--line);
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .status-pill-btn:hover {
          background: var(--line);
          color: var(--ink-primary);
        }
        .status-pill-btn--active {
          background: var(--ink-primary);
          color: #ffffff;
          border-color: var(--ink-primary);
        }
        .status-pill-btn--active.status-pill-btn--success {
          background: var(--emerald);
          border-color: var(--emerald);
          color: #ffffff;
        }
        .status-pill-btn--active.status-pill-btn--danger {
          background: var(--danger);
          border-color: var(--danger);
          color: #ffffff;
        }
        .pill-count {
          padding: 1px 6px;
          background: rgba(255, 255, 255, 0.22);
          border-radius: var(--radius-full);
          font-size: 0.68rem;
          font-weight: 700;
        }
        .status-pill-btn:not(.status-pill-btn--active) .pill-count {
          background: var(--bg-surface);
          border: 1px solid var(--line);
          color: var(--ink-muted);
        }

        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .pill-dot--success {
          background: var(--emerald);
        }
        .pill-dot--danger {
          background: var(--danger);
        }
        .status-pill-btn--active .pill-dot {
          background: #ffffff;
        }

        /* Card Top Pills */
        .card-top-pills {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 700;
        }
        .status-pill--success {
          background: var(--emerald-light);
          color: var(--emerald);
          border: 1px solid var(--emerald-border);
        }
        .status-pill--danger {
          background: var(--danger-light);
          color: var(--danger);
          border: 1px solid var(--danger-border);
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .status-dot--success {
          background: var(--emerald);
        }
        .status-dot--danger {
          background: var(--danger);
        }
        .brand-chip {
          padding: 2px 8px;
          background: var(--bg-subtle);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--ink-secondary);
        }

        .card-hook-quote {
          font-size: var(--text-xs);
          color: var(--ink-muted);
          font-style: italic;
          line-height: 1.35;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .video-preview-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%);
        }
        .preview-play-btn {
          pointer-events: auto;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          color: var(--ink-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .preview-play-btn:hover {
          transform: scale(1.1);
          background: #ffffff;
        }
        .preview-duration-chip {
          position: absolute;
          bottom: 8px;
          right: 8px;
          padding: 2px 6px;
          background: rgba(0, 0, 0, 0.75);
          color: #ffffff;
          border-radius: var(--radius-xs);
          font-size: 0.7rem;
          font-family: var(--font-mono);
          font-weight: 600;
        }

        .preview-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px;
          text-align: center;
        }
        .preview-placeholder--archived {
          background: #111827;
          color: #94a3b8;
          font-size: var(--text-xs);
        }
        .preview-placeholder--failed {
          background: #1e1b1e;
          color: #fca5a5;
        }
        .failed-badge-icon {
          color: #ef4444;
        }
        .failed-title {
          font-size: var(--text-xs);
          font-weight: 700;
          color: #fca5a5;
        }
        .failed-code {
          font-size: 0.7rem;
          font-family: var(--font-mono);
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 6px;
          border-radius: 4px;
          color: #fee2e2;
        }

        .btn--sm {
          padding: 6px 12px;
          font-size: var(--text-xs);
        }
        .btn--primary {
          background: var(--brand-primary);
          color: #ffffff;
          border-color: var(--brand-primary);
        }
        .btn--primary:hover {
          background: var(--brand-primary-hover);
          border-color: var(--brand-primary-hover);
          color: #ffffff;
        }
        .btn--secondary {
          background: var(--bg-surface);
          color: var(--ink-primary);
          border-color: var(--line);
        }
        .btn--disabled {
          opacity: 0.5;
          cursor: not-allowed;
          pointer-events: none;
        }

        /* Empty State */
        .history-empty-deck {
          background: var(--bg-surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-xl);
          padding: 60px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          box-shadow: var(--shadow-sm);
        }
        .empty-icon-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--bg-subtle);
          border: 1px solid var(--line);
          color: var(--ink-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        .history-empty-deck h3 {
          font-size: var(--text-lg);
          font-weight: 700;
          color: var(--ink-primary);
          margin: 0;
        }
        .history-empty-deck p {
          font-size: var(--text-sm);
          color: var(--ink-muted);
          max-width: 480px;
          margin: 0;
        }

        /* Modal Internals */
        .modal-header-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .modal-header-tag-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .modal-header-info h2 {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--ink-primary);
          margin: 0;
        }
        .modal-id-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--text-xs);
          color: var(--ink-muted);
        }
        .modal-id-row code {
          font-family: var(--font-mono);
          background: var(--bg-subtle);
          padding: 2px 6px;
          border-radius: var(--radius-xs);
          color: var(--ink-secondary);
        }
        .btn-copy-id {
          background: none;
          border: 1px solid var(--line);
          padding: 2px 6px;
          border-radius: var(--radius-xs);
          font-size: 0.7rem;
          cursor: pointer;
          color: var(--brand-primary);
          font-family: inherit;
        }
        .btn-copy-id:hover {
          background: var(--bg-subtle);
        }

        .modal-video-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-player-wrapper {
          width: 100%;
          aspect-ratio: 9/16;
          max-height: 480px;
          background: #000000;
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-video-player {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .modal-player-placeholder {
          padding: 24px;
          text-align: center;
          color: #94a3b8;
          font-size: var(--text-sm);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .modal-player-placeholder--failed {
          color: #fca5a5;
        }
        .modal-player-placeholder--failed h4 {
          margin: 0;
          font-size: var(--text-base);
          color: #ef4444;
        }
        .modal-player-placeholder--failed code {
          background: rgba(0, 0, 0, 0.5);
          padding: 4px 8px;
          border-radius: 4px;
        }
        .modal-player-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .modal-details-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .modal-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .modal-section-title {
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--ink-primary);
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }
        .empty-script-box {
          padding: 16px;
          background: var(--bg-subtle);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--ink-muted);
        }

        .metadata-ledger-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 14px;
          background: var(--bg-subtle);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          margin: 0;
        }
        .ledger-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ledger-item.full-width {
          grid-column: span 2;
        }
        .ledger-item dt {
          font-size: 0.72rem;
          color: var(--ink-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }
        .ledger-item dd {
          margin: 0;
          font-size: var(--text-xs);
          color: var(--ink-primary);
        }
        .ledger-item dd code {
          font-family: var(--font-mono);
          font-size: 0.72rem;
        }

        @media (max-width: 768px) {
          .modal-dialog__body {
            grid-template-columns: 1fr;
          }
          .modal-player-wrapper {
            max-height: 360px;
          }
        }
      `}</style>
    </div>
  );
}
