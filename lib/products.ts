import { db, type Product, type Variant } from "./db.ts";
import { PRICE_STEP } from "./format.ts";
import { likeContains, MAX_PRICE, toLatinDigits } from "./validation.ts";

export const PAGE_SIZE = 12;

// ?sort= value -> label and SQL order. Only these fixed strings ever reach the query.
export const SORTS = {
  new: ["جدیدترین", "id DESC"],
  cheap: ["ارزان‌ترین", "price ASC, id DESC"],
  expensive: ["گران‌ترین", "price DESC, id DESC"],
} as const;

type Params = Record<string, string | string[] | undefined>;
export type ProductWithStock = Product & { variants: Variant[] };

/**
 * The shop listing for these URL params (category, type, q, sort, sale, min, max, page). The home page shows pages
 * 1..page (so a reload or shared ?page=N link keeps the list); onlyThisPage gives just that page, for /api/products.
 */
export async function listProducts(params: Params, onlyThisPage = false) {
  const category = typeof params.category === "string" ? params.category : undefined;
  // Arabic-keyboard ي/ك typed into a Persian search would otherwise never match.
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 50).replace(/ي/g, "ی").replace(/ك/g, "ک") : "";
  // A type (subcategory, picked in the side menu) only means something inside its category, e.g. ?category=کفش&type=بوت.
  const type = category && typeof params.type === "string" ? params.type : undefined;
  const sort = typeof params.sort === "string" && params.sort in SORTS ? (params.sort as keyof typeof SORTS) : "new";
  const sale = params.sale === "1";
  // ?min= / ?max= in Toman; Persian digits and thousands separators are fine, anything else is ignored.
  const price = (v: unknown) => {
    const n = typeof v === "string" ? Number(toLatinDigits(v).replace(/\D/g, "")) : 0;
    return Number.isInteger(n) && n >= 1 && n <= MAX_PRICE ? n : undefined;
  };
  let [min, max] = [price(params.min), price(params.max)];
  if (min && max && min > max) [min, max] = [max, min];

  const where = ["active = 1"];
  const args: (string | number)[] = [];
  if (category) {
    where.push("category = ?");
    args.push(category);
  }
  if (type) {
    where.push("subcategory = ?");
    args.push(type);
  }
  if (sale) where.push("compare_price > price");
  if (q) {
    const like = likeContains(q);
    where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR subcategory LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like);
  }
  // The slider's ends: this listing's cheapest and dearest product before the price filter, on the slider's step.
  const range = (await db.prepare(`SELECT MIN(price) AS lo, MAX(price) AS hi FROM products WHERE ${where.join(" AND ")}`).get(...args)) as { lo: number | null; hi: number | null };
  const lo = Math.floor((range.lo ?? 0) / PRICE_STEP) * PRICE_STEP;
  const hi = Math.ceil((range.hi ?? 0) / PRICE_STEP) * PRICE_STEP;
  // A limit at (or past) an end of the slider filters nothing, so it is dropped and the plain listing stays the plain address.
  if (min && min <= lo) min = undefined;
  if (max && max >= hi) max = undefined;
  if (min) {
    where.push("price >= ?");
    args.push(min);
  }
  if (max) {
    where.push("price <= ?");
    args.push(max);
  }
  const filter = where.join(" AND ");
  const total = ((await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${filter}`).get(...args)) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asked = Math.max(1, Math.floor(Number(params.page)) || 1);
  // The home page clamps a too-high ?page=; the API answers it with an empty page.
  const page = onlyThisPage ? asked : Math.min(pages, asked);
  const [limit, offset] = onlyThisPage ? [PAGE_SIZE, (page - 1) * PAGE_SIZE] : [page * PAGE_SIZE, 0];
  const rows = (await db.prepare(`SELECT * FROM products WHERE ${filter} ORDER BY ${SORTS[sort][1]} LIMIT ? OFFSET ?`).all(...args, limit, offset)) as Product[];
  const ids = rows.map((p) => p.id);
  const inStock = Map.groupBy(
    ids.length
      ? ((await db.prepare(`SELECT * FROM variants WHERE stock > 0 AND product_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).all(...ids)) as Variant[])
      : [],
    (v) => v.product_id,
  );
  const products: ProductWithStock[] = rows.map((p) => ({ ...p, variants: inStock.get(p.id) ?? [] }));
  return { products, total, page, pages, category, type, q, sort, sale, min, max, lo, hi };
}
