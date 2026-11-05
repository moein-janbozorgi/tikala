import { db } from "@/lib/db";
import { likeContains } from "@/lib/validation";

export type Suggestion = { id: number; name: string; price: number; image: string; category: string };

// Products for the header search's suggestion list: up to 6, names starting with the text first.
export function GET(req: Request) {
  // Arabic-keyboard ي/ك typed into a Persian search would otherwise never match (same as the home page).
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 50).replace(/ي/g, "ی").replace(/ك/g, "ک");
  if (!q) return Response.json([]);
  const like = likeContains(q);
  const rows = db
    .prepare(
      `SELECT id, name, price, image, category FROM products
       WHERE active = 1 AND (name LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR subcategory LIKE ? ESCAPE '\\')
       ORDER BY name LIKE ? ESCAPE '\\' DESC, id DESC LIMIT 6`,
    )
    .all(like, like, like, like.slice(1)) as Suggestion[];
  return Response.json(rows);
}
