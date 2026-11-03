import Image from "next/image";
import Link from "next/link";
import { db, type Product, type Variant } from "@/lib/db";
import { addToCart } from "./actions";
import { ErrorMessage } from "./error-message";
import { BagIcon } from "./icons";
import { LoadMore } from "./load-more";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";
import { SearchInput } from "./search-input";

const PAGE_SIZE = 12;

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : undefined;
  // Arabic-keyboard ي/ك typed into a Persian search would otherwise never match.
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 50).replace(/ي/g, "ی").replace(/ك/g, "ک") : "";
  // A type (subcategory, picked in the side menu) only means something inside its category, e.g. ?category=کفش&type=بوت.
  const type = category && typeof params.type === "string" ? params.type : undefined;
  // Each category is pictured by its newest product that has an image.
  const categories = db
    .prepare(
      `SELECT category, (SELECT image FROM products p2 WHERE p2.active = 1 AND p2.category = p.category ORDER BY p2.image = '', p2.id DESC LIMIT 1) AS image
       FROM products p WHERE active = 1 AND category != '' GROUP BY category ORDER BY category`,
    )
    .all() as { category: string; image: string }[];

  const where = ["active = 1"];
  const args: string[] = [];
  if (category) {
    where.push("category = ?");
    args.push(category);
  }
  if (type) {
    where.push("subcategory = ?");
    args.push(type);
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`; // the user's % and _ are literal, not wildcards
    where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR subcategory LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like);
  }
  const filter = where.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${filter}`).get(...args) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // ?page=N shows the first N pages, so infinite scroll can grow the list and a reload or shared link keeps it.
  // shortcut: every scroll step re-renders the whole list, fine for a few hundred products; switch to fetching only the new page beyond that.
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page)) || 1));
  const products = db.prepare(`SELECT * FROM products WHERE ${filter} ORDER BY id DESC LIMIT ?`).all(...args, page * PAGE_SIZE) as Product[];
  const ids = products.map((p) => p.id);
  const inStock = Map.groupBy(
    ids.length
      ? (db.prepare(`SELECT * FROM variants WHERE stock > 0 AND product_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).all(...ids) as Variant[])
      : [],
    (v) => v.product_id,
  );
  /** Link to this listing with some parameters changed, keeping the rest. */
  const link = (change: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, type, q: q || undefined, page: undefined, ...change })) if (v) next.set(k, String(v));
    return next.size ? `/?${next}` : "/";
  };

  return (
    <>
      <ErrorMessage error={typeof params.error === "string" ? params.error : undefined} />
      {category || q ? null : (
        <section className="mb-10 flex items-center justify-between gap-6 rounded-3xl bg-brand px-6 py-12 text-brand-ink sm:px-12 sm:py-16">
          <div>
            <h1 className="max-w-lg font-display text-4xl leading-tight sm:text-6xl sm:leading-tight">استایل هر روزت را این‌جا پیدا کن</h1>
            <p className="mt-4 max-w-md leading-7 text-brand-ink/75">بوتیک تیکلا عرضه کننده انواع لباس و شلوار مد روز</p>
          </div>
          {/* The PNG has a white background, so it sits in a white circle to look intentional in both themes. */}
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-white p-4 sm:size-44 sm:p-8">
            <Image src="/products/tik.png" alt="" width={148} height={148} priority className="size-full" />
          </div>
        </section>
      )}

      <form action="/" role="search" className="mb-4 flex gap-2">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <SearchInput defaultValue={q} />
        <button className="btn shrink-0">جستجو</button>
      </form>

      <nav aria-label="دسته‌بندی‌ها" className="mb-6 flex gap-4 overflow-x-auto p-1 pb-2 sm:gap-6">
        {[{ category: "", image: "" }, ...categories].map((c) => {
          const active = (category ?? "") === c.category;
          return (
            <Link
              key={c.category}
              href={link({ category: c.category || undefined, type: undefined })}
              aria-current={active ? "page" : undefined}
              className="group flex w-16 shrink-0 flex-col items-center gap-2 sm:w-20"
            >
              <span
                className={`block rounded-full p-0.5 ring-2 transition ${active ? "ring-accent" : "ring-line group-hover:ring-muted"}`}
              >
                {c.category ? (
                  <ProductImage src={c.image} alt="" className="size-14 rounded-full text-[10px] sm:size-18" />
                ) : (
                  <span className="grid size-14 place-items-center rounded-full bg-white p-3 sm:size-18">
                    <Image src="/products/tik.png" alt="" width={48} height={48} className="size-full" />
                  </span>
                )}
              </span>
              <span className={`line-clamp-1 text-center text-xs sm:text-sm ${active ? "font-bold" : "text-muted group-hover:text-ink"}`}>
                {c.category || "همه"}
              </span>
            </Link>
          );
        })}
      </nav>

      {q ? (
        <p className="mb-4 text-sm text-muted">
          {total.toLocaleString("fa-IR")} نتیجه برای «{q}»{" "}
          <Link href={link({ q: undefined })} className="text-accent hover:underline">
            پاک کردن جستجو
          </Link>
        </p>
      ) : null}
      {products.length === 0 ? <p className="py-16 text-center text-muted">محصولی یافت نشد.</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {products.map((p) => {
          const variants = inStock.get(p.id) ?? [];
          return (
            <article
              key={p.id}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-2 sm:p-2.5"
            >
              <Link href={`/product/${p.id}`} className="block">
                <div className="relative overflow-hidden rounded-xl">
                  <ProductImage
                    src={p.image}
                    alt={p.name}
                    className={`aspect-4/5 w-full transition duration-500 group-hover:scale-105 ${variants.length ? "" : "opacity-60 grayscale"}`}
                  />
                  {p.subcategory ? (
                    <span className="absolute top-2.5 right-2.5 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                      {p.subcategory}
                    </span>
                  ) : null}
                  {variants.length ? null : (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1.5 text-center text-xs font-medium text-page backdrop-blur">ناموجود</span>
                  )}
                </div>
                <div className="px-1.5 pt-3">
                  <p className="text-[11px] text-muted">{p.category}</p>
                  {/* Two lines kept even for short names, so prices and buttons line up across a row. */}
                  <h2 className="mt-1 line-clamp-2 min-h-[2lh] text-sm leading-6 font-bold sm:text-base sm:leading-6">
                    {p.name}
                  </h2>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-extrabold">{p.price.toLocaleString("fa-IR")}</span>
                    <span className="text-xs text-muted">تومان</span>
                  </p>
                </div>
              </Link>
              {variants.length ? (
                <form action={addToCart} className="mt-auto space-y-2 px-0.5 pt-3 pb-0.5">
                  <fieldset>
                    <legend className="sr-only">سایز و رنگ {p.name}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {variants.map((v, i) => (
                        <label
                          key={v.id}
                          title={`موجودی: ${v.stock.toLocaleString("fa-IR")}`}
                          className="chip px-2.5 py-1 text-xs has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent"
                        >
                          <input type="radio" name="variantId" value={v.id} defaultChecked={i === 0} required className="sr-only" />
                          {v.size} · {v.color}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex items-center gap-1.5">
                    <QtyStepper max={Math.max(...variants.map((v) => v.stock))} />
                    <button className="btn min-w-0 flex-1 px-2">
                      <span className="hidden sm:block">
                        <BagIcon />
                      </span>
                      خرید
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-auto px-1.5 pt-3 pb-2 text-xs text-muted">به‌زودی دوباره موجود می‌شود</p>
              )}
            </article>
          );
        })}
      </div>

      {page < pages ? <LoadMore href={link({ page: page + 1 })} /> : null}
    </>
  );
}
