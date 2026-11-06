import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image (Dockerfile) builds with STANDALONE=1: a self-contained server.js with only the files it needs.
  output: process.env.STANDALONE ? "standalone" : undefined,
  experimental: {
    // The product form uploads photos of up to 5 MB each (lib/uploads.ts), 25 MB per save (app/validated-form.tsx checks
    // it before sending). Extra room is multipart overhead. Kept this low because it applies to every form.
    serverActions: { bodySizeLimit: "30mb" },
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
      // Long browser and CDN caching for files in public/ (Next marks only /_next/static as immutable). Fonts never
      // change; the sample product photos might be replaced under the same name, so they get a week.
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/products/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
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
