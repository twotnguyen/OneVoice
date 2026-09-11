// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from "next";

// Hostname ảnh sản phẩm cho phép, đọc từ ONEVOICE_IMAGE_HOSTS (phân tách
// bằng dấu phẩy, khớp runtime-composition) để next/image không mở proxy ảnh
// tùy ý. Fallback đúng default của server env khi biến build-time trống.
function resolveImageHostnames(): string[] {
  const raw = process.env.ONEVOICE_IMAGE_HOSTS ?? "product.hstatic.net";
  const hosts = raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9]([a-z0-9.-]{0,253}[a-z0-9])?$/.test(host));
  return hosts.length > 0 ? hosts : ["product.hstatic.net"];
}

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: resolveImageHostnames().map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
