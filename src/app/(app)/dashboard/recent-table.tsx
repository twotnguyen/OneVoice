// SPDX-License-Identifier: Apache-2.0

import type { ActivityRow } from "@/lib/stats/aggregations";

export function RecentActivityTable({ recent }: Readonly<{ recent: readonly ActivityRow[] }>) {
  return (
    <section className="card" aria-labelledby="recent-heading">
      <h2 id="recent-heading">Hoạt động gần đây</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Sản phẩm</th>
            <th scope="col">Thời gian</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Thời lượng</th>
            <th scope="col">Video</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((row) => (
            <tr key={row.renderId}>
              <td>{row.productName}</td>
              <td>
                <time dateTime={row.createdAt}>
                  {new Date(row.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                </time>
              </td>
              <td>{row.status === "succeeded" ? "Thành công" : "Thất bại"}</td>
              <td>{row.totalDurationMs == null ? "—" : `${row.totalDurationMs.toLocaleString("vi-VN")} ms`}</td>
              <td>
                {row.hasVideo ? (
                  <a href={`/api/renders/${row.renderId}/video`}>Mở video</a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
