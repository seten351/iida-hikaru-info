import type { NextConfig } from "next";

const adminNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/admin/:path*", headers: adminNoStoreHeaders }];
  },
};

export default nextConfig;
