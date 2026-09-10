// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { AppNav } from "./nav";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">OneVoice</span>
        <AppNav />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
