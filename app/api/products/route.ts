import { listProducts } from "@/lib/products";

// One page of the shop listing (same params as the home page, plus ?page=N), for infinite scroll: only the new cards
// travel, instead of re-rendering every page above them. Searches aren't counted here; the home page already did.
export async function GET(req: Request) {
  const { products, page, pages } = await listProducts(Object.fromEntries(new URL(req.url).searchParams), true);
  // The description isn't shown on cards; leaving it out keeps the response small.
  return Response.json({ items: products.map((p) => ({ ...p, description: "" })), hasMore: page < pages });
}
