import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product photo uploads are up to 5 MB (lib/uploads.ts); the default 1 MB would reject them. Extra room is multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
    // A click or form sent while offline waits and retries instead of failing; app/offline-screen.tsx says why.
    useOffline: true,
  },
  // No other site may frame the shop (clickjacking on checkout or the admin panel). No img-src rule: admins paste image URLs from any host.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
