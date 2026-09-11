// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import type { ReactNode } from "react";

import { AppNav } from "./nav";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="app-brand" title="Về trang chủ OneVoice">
          OneVoice
        </Link>
        <AppNav />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
