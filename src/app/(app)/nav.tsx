// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveSection, NAV_SECTIONS } from "./nav-sections";

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng chính" className="app-nav">
      <ul>
        {NAV_SECTIONS.map((entry) =>
          entry.status === "disabled" ? (
            <li key={entry.href}>
              <span aria-disabled="true" className="app-nav__link app-nav__link--disabled">
                {entry.label}
                <span className="app-nav__badge">Sắp ra mắt</span>
              </span>
            </li>
          ) : (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={isActiveSection(pathname, entry.href) ? "page" : undefined}
                className={
                  isActiveSection(pathname, entry.href)
                    ? "app-nav__link app-nav__link--active"
                    : "app-nav__link"
                }
              >
                {entry.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
