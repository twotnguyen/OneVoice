// SPDX-License-Identifier: Apache-2.0

export type NavEntry = Readonly<{
  href: string;
  label: string;
  status: "active" | "disabled";
}>;

export const NAV_SECTIONS: readonly NavEntry[] = [
  { href: "/", label: "Studio", status: "active" },
  { href: "/dashboard", label: "Tổng quan", status: "active" },
  { href: "/history", label: "Lịch sử", status: "disabled" },
  { href: "/catalog", label: "Khám phá catalog", status: "disabled" },
  { href: "/funnel", label: "Funnel", status: "disabled" },
];

export function isActiveSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
