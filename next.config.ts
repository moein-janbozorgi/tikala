import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product photo uploads are up to 5 MB (lib/uploads.ts); the default 1 MB would reject them. Extra room is multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
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
