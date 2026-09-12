// SPDX-License-Identifier: Apache-2.0

export type NavEntry = Readonly<{
  href: string;
  label: string;
  status: "active" | "disabled";
}>;

export const NAV_SECTIONS: readonly NavEntry[] = [
  { href: "/dashboard", label: "Tổng quan", status: "active" },
  { href: "/", label: "Studio", status: "active" },
  { href: "/catalog", label: "Khám phá catalog", status: "active" },
  { href: "/history", label: "Lịch sử video", status: "active" },
  { href: "/funnel", label: "Marketing Funnel", status: "active" },
];

export function isActiveSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
