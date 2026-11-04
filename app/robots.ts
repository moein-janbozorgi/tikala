import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";

// SITE_URL is read when the server runs, not baked in at build time.
export const dynamic = "force-dynamic";

/** Search engines may list the shop, but not the private pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/payment", "/*?auth="] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
