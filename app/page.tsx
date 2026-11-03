import Image from "next/image";
import Link from "next/link";
import { db, type Product, type Variant } from "@/lib/db";
import { addToCart } from "./actions";
import { ErrorMessage } from "./error-message";
import { BagIcon } from "./icons";
import { LoadMore } from "./load-more";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";

const PAGE_SIZE = 12;

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : undefined;
  // Arabic-keyboard ي/ك typed into a Persian search would otherwise never match.
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 50).replace(/ي/g, "ی").replace(/ك/g, "ک") : "";
  // A type (subcategory, picked in the side menu) only means something inside its category, e.g. ?category=کفش&type=بوت.
  const type = category && typeof params.type === "string" ? params.type : undefined;
  const categories = db
    .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
    .all() as { category: string }[];

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
        <section className="mb-10 flex items-center justify-between gap-6 rounded-3xl bg-surface-2 px-6 py-12 sm:px-12 sm:py-16">
          <div>
            <p className="text-sm font-medium text-accent">کالکشن فصل</p>
            <h1 className="mt-3 max-w-lg text-3xl leading-tight font-extrabold sm:text-5xl sm:leading-tight">استایل هر روزت را این‌جا پیدا کن</h1>
            <p className="mt-4 max-w-md leading-7 text-muted">بوتیک تیکالا عرضه کننده انواع لباس و شلوار مد روز</p>
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
        <input type="search" name="q" defaultValue={q} placeholder="جستجوی محصول…" aria-label="جستجوی محصول" maxLength={50} className="input" />
        <button className="btn shrink-0">جستجو</button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={link({ category: undefined, type: undefined })} className={`chip ${!category ? "chip-active" : ""}`}>
          همه
        </Link>
        {categories.map((c) => (
          <Link
            key={c.category}
            href={link({ category: c.category, type: undefined })}
            className={`chip ${category === c.category ? "chip-active" : ""}`}
          >
            {c.category}
          </Link>
        ))}
      </div>

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
              className="group flex flex-col rounded-3xl border border-line bg-surface p-2 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 sm:p-2.5"
            >
              <Link href={`/product/${p.id}`} className="block">
                <div className="relative overflow-hidden rounded-2xl">
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
                  <h2 className="mt-1 line-clamp-2 min-h-[2lh] text-sm leading-6 font-bold transition group-hover:text-accent sm:text-base sm:leading-6">
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
                  <select name="variantId" aria-label={`سایز و رنگ ${p.name}`} className="input rounded-full bg-page py-1.5 text-xs sm:text-sm">
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.size} · {v.color}
                      </option>
                    ))}
                  </select>
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
