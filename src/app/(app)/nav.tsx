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
        {NAV_SECTIONS.map((entry) => {
          const active = isActiveSection(pathname, entry.href);
          const disabled = entry.status === "disabled";

          return (
            <li key={entry.href}>
              <Link
                href={disabled ? "#" : entry.href}
                aria-current={active ? "page" : undefined}
                aria-disabled={disabled ? "true" : undefined}
                className={
                  disabled
                    ? "app-nav__link app-nav__link--disabled"
                    : active
                      ? "app-nav__link app-nav__link--active"
                      : "app-nav__link"
                }
              >
                {entry.label}
                {disabled && <span className="app-nav__badge">Sắp ra mắt</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
