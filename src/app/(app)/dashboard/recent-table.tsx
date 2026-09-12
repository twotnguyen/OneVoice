// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import type { ActivityRow } from "@/lib/stats/aggregations";

export function RecentActivityTable({ recent }: Readonly<{ recent: readonly ActivityRow[] }>) {
  return (
    <section className="card recent-activity-card" aria-labelledby="recent-heading">
      <div className="card-header-row">
        <div>
          <h2 id="recent-heading" className="card-title">Hoạt Động Sản Xuất Gần Đây</h2>
          <p className="card-subtitle">Nhật ký các lượt render video gần nhất</p>
        </div>
        <Link href="/history" className="view-all-link">
          <span>Xem tất cả lịch sử</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="recent-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <strong>Chưa có lượt render nào</strong>
          <p>Hãy chọn sản phẩm từ catalog và bắt đầu dựng video marketing đầu tiên.</p>
          <Link href="/" className="btn btn--primary" style={{ marginTop: "8px" }}>
            Tới Studio dựng video
          </Link>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thời gian chạy</th>
                <th scope="col" style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.renderId}>
                  <td>
                    <div className="table-product-cell">
                      <span className="table-product-name">{row.productName || "Sản phẩm catalog"}</span>
                      <span className="table-render-id">ID: {row.renderId.slice(0, 8)}...</span>
                    </div>
                  </td>
                  <td>
                    <time dateTime={row.createdAt} className="table-time-cell">
                      {new Date(row.createdAt).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </time>
                  </td>
                  <td>
                    <span className={`status-badge ${row.status === "succeeded" ? "status-badge--in" : "status-badge--out"}`}>
                      <span className="status-badge-dot" aria-hidden="true" />
                      <span>{row.status === "succeeded" ? "Thành công" : "Thất bại"}</span>
                    </span>
                  </td>
                  <td className="table-duration-cell">
                    {row.totalDurationMs == null
                      ? "—"
                      : `${(row.totalDurationMs / 1000).toFixed(1)}s`}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="table-actions-cell">
                      {row.hasVideo && (
                        <a
                          href={`/api/renders/${row.renderId}/video`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="table-action-link"
                          title="Mở video MP4"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          <span>Xem video</span>
                        </a>
                      )}
                      {row.status === "failed" && row.productId && (
                        <Link
                          href={`/?selectedId=${row.productId}`}
                          className="table-retry-link"
                          title="Thử tạo lại video trong Studio"
                        >
                          Thử lại
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
