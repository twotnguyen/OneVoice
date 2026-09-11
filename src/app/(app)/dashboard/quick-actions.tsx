// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";

export function QuickActions() {
  const actions = [
    {
      title: "Mở Bàn Dựng Video AI",
      description: "Tạo kịch bản, lồng tiếng và render video marketing cho sản phẩm mới.",
      href: "/",
      cta: "Bắt đầu dựng video →",
      badge: "Studio",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
      featured: true,
    },
    {
      title: "Khám Phá Showroom Catalog",
      description: "Xem chi tiết 3.977 sản phẩm, kho ảnh CDN và bảng thông số 24 chỉ số.",
      href: "/catalog",
      cta: "Khám phá catalog →",
      badge: "Showroom",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      featured: false,
    },
    {
      title: "Phễu Tiếp Thị & Chuyển Đổi",
      description: "Phân tích tỷ lệ phủ video trên danh mục và mức độ tiêu thụ tài nguyên AI.",
      href: "/funnel",
      cta: "Xem báo cáo phễu →",
      badge: "Analytics",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      ),
      featured: false,
    },
  ];

  return (
    <section className="quick-actions-section" aria-labelledby="quick-actions-heading">
      <div className="quick-actions-header">
        <h2 id="quick-actions-heading" className="card-title">Trung Tâm Tác Vụ Nhanh</h2>
        <span className="quick-actions-sub">Lối tắt tác vụ vận hành chính</span>
      </div>

      <div className="quick-actions-grid">
        {actions.map((act) => (
          <Link
            key={act.href}
            href={act.href}
            className={`quick-action-card ${act.featured ? "quick-action-card--featured" : ""}`}
          >
            <div className="quick-action-card__icon">{act.icon}</div>
            <div className="quick-action-card__body">
              <div className="quick-action-card__top">
                <strong>{act.title}</strong>
                <span className="quick-action-badge">{act.badge}</span>
              </div>
              <p>{act.description}</p>
              <span className="quick-action-cta">{act.cta}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
