import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/format";

// Read from the database on each request, so new products show up without a rebuild.
export const dynamic = "force-dynamic";

/** The home page, each category with products, and every product on sale. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const categories = (await db.prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != ''").all()) as { category: string }[];
  const products = (await db.prepare("SELECT id FROM products WHERE active = 1 ORDER BY id").all()) as { id: number }[];
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...categories.map((c) => ({ url: `${SITE_URL}/?${new URLSearchParams({ category: c.category })}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE_URL}/product/${p.id}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
