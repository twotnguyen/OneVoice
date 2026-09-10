// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";

export function DashboardEmpty() {
  return (
    <div className="card">
      <h2>Chưa có render nào</h2>
      <p>Chạy render đầu tiên từ Studio để xem số liệu tại đây.</p>
      <Link href="/" className="btn">
        Mở Studio
      </Link>
    </div>
  );
}
