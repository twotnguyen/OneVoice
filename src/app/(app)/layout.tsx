// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/auth/guards";

import { AppNav } from "./nav";
import styles from "./header-actions.module.css";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await requirePagePermission("read_catalog", "/catalog");
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/dashboard" className="app-brand" title="Về trang tổng quan OneVoice">
          OneVoice
        </Link>
        <AppNav />
        <div className={`app-header__spacer ${styles.actions}`}>
          <Link href="/campaigns">Chiến dịch</Link>
          <Link href="/support">Hỗ trợ</Link>
          {actor.role === "manager" && <Link href="/settings">Cấu hình</Link>}
          <form action="/api/auth/logout" method="post"><button type="submit">Đăng xuất</button></form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
