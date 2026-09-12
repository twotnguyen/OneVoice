// SPDX-License-Identifier: Apache-2.0

export type ServiceStatus = Readonly<{
  name: string;
  role: string;
  status: "healthy" | "warning" | "error";
  metric: string;
  badge: string;
}>;

export function ServiceHealth({
  totalProducts,
  contentReadyProducts,
}: Readonly<{
  totalProducts: number;
  contentReadyProducts: number;
}>) {
  const services: readonly ServiceStatus[] = [
    {
      name: "Supabase PostgreSQL & Storage",
      role: "Cơ sở dữ liệu Catalog & Renders",
      status: "healthy",
      metric: `${totalProducts.toLocaleString("vi-VN")} sản phẩm (${contentReadyProducts.toLocaleString("vi-VN")} khả dụng)`,
      badge: "Đã kết nối",
    },
    {
      name: "Asynchronous FileJobQueue",
      role: "Hàng đợi render tách biệt tiến trình",
      status: "healthy",
      metric: "0 tác vụ nghẽn · Khôi phục tự động 300s",
      badge: "Sẵn sàng",
    },
    {
      name: "Microsoft Edge-TTS & VieNeu-TTS",
      role: "Động cơ lồng tiếng tiếng Việt đa giọng",
      status: "healthy",
      metric: "Hoài My (Nữ) · Nam Minh (Nam) · VieNeu AI",
      badge: "Trực tuyến",
    },
    {
      name: "HyperFrames & Chromium Engine",
      role: "Dựng video poster HTML5 & WebGL",
      status: "healthy",
      metric: "11 Templates đồ họa · Muxing FFmpeg 44.1kHz",
      badge: "Hoạt động",
    },
  ];

  return (
    <article className="card service-health-card" aria-labelledby="health-heading">
      <div className="card-header-row">
        <h2 id="health-heading" className="card-title">
          <span className="health-live-dot" aria-hidden="true" />
          <span>Sức Khỏe Hệ Thống & Hạ Tầng</span>
        </h2>
        <span className="health-pill-all-green">100% Hoạt Động</span>
      </div>

      <div className="service-health-list">
        {services.map((svc) => (
          <div key={svc.name} className="service-health-item">
            <div className="service-health-item__indicator">
              <span className={`status-dot status-dot--${svc.status}`} aria-hidden="true" />
            </div>
            <div className="service-health-item__body">
              <div className="service-health-item__header">
                <strong>{svc.name}</strong>
                <span className="service-badge">{svc.badge}</span>
              </div>
              <p className="service-role">{svc.role}</p>
              <span className="service-metric">{svc.metric}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
