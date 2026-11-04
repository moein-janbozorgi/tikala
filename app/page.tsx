import type { Metadata } from "next";
import Link from "next/link";
import { db, type Product, type Variant } from "@/lib/db";
import { percentOff, PRICE_STEP, toman } from "@/lib/format";
import { likeContains, MAX_PRICE, toLatinDigits } from "@/lib/validation";
import { addToCart } from "./actions";
import { ErrorMessage } from "./error-message";
import { FEATURES } from "./footer";
import { BagCheckArt, BagIcon, GlassesIcon, GridIcon, HoodieIcon, JacketIcon, PantsIcon, ShirtIcon, ShoeIcon, SweaterIcon, TshirtIcon } from "./icons";
import { LoadMore } from "./load-more";
import { PriceRange } from "./price-range";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";
import { SearchInput } from "./search-input";

const PAGE_SIZE = 12;

// Icon and circle color per category; a category the admin adds later gets the bag icon and a color by position.
const CATEGORY_LOOK: Record<string, [() => React.ReactNode, string]> = {
  "": [GridIcon, "bg-neutral-800"],
  "تی‌شرت": [TshirtIcon, "bg-rose-500"],
  "پیراهن": [ShirtIcon, "bg-sky-500"],
  "شلوار": [PantsIcon, "bg-indigo-600"],
  "هودی": [HoodieIcon, "bg-orange-500"],
  "کفش": [ShoeIcon, "bg-teal-600"],
  "کاپشن و ژاکت": [JacketIcon, "bg-emerald-700"],
  "بافت": [SweaterIcon, "bg-lime-600"],
  "عینک": [GlassesIcon, "bg-red-600"],
};
const FALLBACK_COLORS = ["bg-violet-600", "bg-amber-500", "bg-cyan-600", "bg-fuchsia-600", "bg-blue-600"];

// ?sort= value -> label and SQL order. Only these fixed strings ever reach the query.
const SORTS = {
  new: ["جدیدترین", "id DESC"],
  cheap: ["ارزان‌ترین", "price ASC, id DESC"],
  expensive: ["گران‌ترین", "price DESC, id DESC"],
} as const;

/**
 * Each category (and type) gets its own title and description, so it can rank for searches like «خرید کفش». The
 * canonical address keeps only category and type: sorted and "load more" versions are the same page to Google, and
 * search results are not indexed.
 */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : undefined;
  const type = category && typeof params.type === "string" ? params.type : undefined;
  const canonical = category ? `/?${new URLSearchParams(type ? { category, type } : { category })}` : "/";
  const exists = !category || db.prepare("SELECT 1 FROM products WHERE active = 1 AND category = ? AND (? IS NULL OR subcategory = ?)").get(category, type ?? null, type ?? null);
  const robots = typeof params.q === "string" || !exists ? { index: false, follow: true } : undefined;
  if (!category) return { alternates: { canonical }, robots };
  const name = type ? `${type} (${category})` : category;
  const description = `خرید ${type ?? category} مد روز از بوتیک تیکلا با انتخاب سایز و رنگ، پرداخت آنلاین یا هنگام تحویل و ارسال به سراسر ایران.`;
  return { title: name, description, alternates: { canonical }, robots, openGraph: { title: name, description, siteName: "تیکلا", locale: "fa_IR", url: canonical } };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
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
  const categories = db
    .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
    .all() as { category: string }[];

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
  const range = db.prepare(`SELECT MIN(price) AS lo, MAX(price) AS hi FROM products WHERE ${where.join(" AND ")}`).get(...args) as { lo: number | null; hi: number | null };
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
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${filter}`).get(...args) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // ?page=N shows the first N pages, so infinite scroll can grow the list and a reload or shared link keeps it.
  // shortcut: every scroll step re-renders the whole list, fine for a few hundred products; switch to fetching only the new page beyond that.
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page)) || 1));
  const products = db.prepare(`SELECT * FROM products WHERE ${filter} ORDER BY ${SORTS[sort][1]} LIMIT ?`).all(...args, page * PAGE_SIZE) as Product[];
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
    for (const [k, v] of Object.entries({ category, type, q: q || undefined, sort: sort === "new" ? undefined : sort, sale: sale ? "1" : undefined, min, max, page: undefined, ...change }))
      if (v) next.set(k, String(v));
    return next.size ? `/?${next}` : "/";
  };

  return (
    <>
      <ErrorMessage error={typeof params.error === "string" ? params.error : undefined} />
      {category || q ? null : (
        <section className="mb-6 flex flex-col-reverse items-start justify-between gap-6 rounded-3xl bg-brand px-5 py-7 text-brand-ink sm:mb-10 sm:flex-row sm:items-center sm:px-12 sm:py-16">
          <div>
            <p className="mb-3 inline-block rounded-full bg-brand-ink px-3 py-1 text-xs font-bold text-brand sm:mb-4">بوتیک آنلاین تیکلا</p>
            <h1 className="max-w-lg font-display text-3xl leading-tight text-balance sm:text-6xl sm:leading-tight">استایل هر روزت را این‌جا پیدا کن</h1>
            {/* On phones the banner stays short so products show sooner; the features are in the footer too. */}
            <p className="mt-4 hidden max-w-lg leading-8 text-brand-ink/80 sm:block">
              از تی‌شرت و پیراهن تا شلوار، هودی، بافت و کفش؛ لباس‌های مد روز را با سایز و رنگ دلخواهت انتخاب کن، آنلاین یا هنگام تحویل
              پرداخت کن و سفارشت را درِ خانه تحویل بگیر.
            </p>
            <ul className="mt-6 hidden flex-wrap gap-2 text-xs font-medium sm:flex sm:text-sm">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5">
                  {f.icon}
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden size-20 shrink-0 place-items-center rounded-full bg-white p-3 shadow-lg shadow-brand-ink/10 sm:grid sm:size-44 sm:p-7">
            <BagCheckArt className="size-full" />
          </div>
        </section>
      )}

      <form action="/" role="search" className="mb-4 flex gap-2">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
        {sort === "new" ? null : <input type="hidden" name="sort" value={sort} />}
        {sale ? <input type="hidden" name="sale" value="1" /> : null}
        {min ? <input type="hidden" name="min" value={min} /> : null}
        {max ? <input type="hidden" name="max" value={max} /> : null}
        <SearchInput defaultValue={q} />
        <button className="btn shrink-0">جستجو</button>
      </form>

      <nav aria-label="دسته‌بندی‌ها" className="mb-6 flex justify-between gap-4 overflow-x-auto p-1 pb-2 sm:gap-6">
        {[{ category: "" }, ...categories].map((c, i) => {
          const active = (category ?? "") === c.category;
          const [CategoryIcon, color] = CATEGORY_LOOK[c.category] ?? [BagIcon, FALLBACK_COLORS[i % FALLBACK_COLORS.length]];
          return (
            <Link
              key={c.category}
              href={link({ category: c.category || undefined, type: undefined })}
              aria-current={active ? "page" : undefined}
              className="group flex w-20 shrink-0 flex-col items-center gap-2 sm:w-24"
            >
              <span
                className={`block rounded-full ring-offset-2 ring-offset-surface transition group-hover:scale-105 ${active ? "ring-2 ring-accent" : ""}`}
              >
                <span className={`grid size-14 place-items-center rounded-full text-white sm:size-16 [&_svg]:size-7 ${color}`}>
                  <CategoryIcon />
                </span>
              </span>
              <span className={`line-clamp-2 text-center text-xs leading-5 ${active ? "font-bold text-accent" : "font-medium"}`}>
                {c.category || "همه"}
              </span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="مرتب‌سازی" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">مرتب‌سازی:</span>
        {Object.entries(SORTS).map(([value, [label]]) => (
          <Link
            key={value}
            href={link({ sort: value === "new" ? undefined : value })}
            scroll={false}
            aria-current={sort === value ? "true" : undefined}
            className={`chip px-3 py-1 ${sort === value ? "chip-active" : ""}`}
          >
            {label}
          </Link>
        ))}
        <Link
          href={link({ sale: sale ? undefined : "1" })}
          scroll={false}
          aria-current={sale ? "true" : undefined}
          className={`chip ms-auto gap-1 px-3 py-1 ${sale ? "border-danger bg-danger text-page" : "text-danger"}`}
        >
          حراج
        </Link>
      </nav>
      <form action="/" aria-label="فیلتر قیمت" className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1 text-sm">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
        {q ? <input type="hidden" name="q" value={q} /> : null}
        {sort === "new" ? null : <input type="hidden" name="sort" value={sort} />}
        {sale ? <input type="hidden" name="sale" value="1" /> : null}
        {hi > lo ? (
          <PriceRange key={`${lo}-${hi}-${min}-${max}`} lo={lo} hi={hi} min={min && Math.min(min, hi)} max={max && Math.max(max, lo)} />
        ) : null}
        <noscript>
          <button className="btn-ghost px-3 py-1">اعمال قیمت</button>
        </noscript>
        {min || max ? (
          <Link href={link({ min: undefined, max: undefined })} scroll={false} className="text-accent hover:underline">
            حذف فیلتر قیمت
          </Link>
        ) : null}
      </form>
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
                  {percentOff(p.price, p.compare_price) ? (
                    <span className="absolute top-2.5 left-2.5 rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold text-page">
                      {`${percentOff(p.price, p.compare_price).toLocaleString("fa-IR")}٪ تخفیف`}
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
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-1">
                    <span className="text-lg font-extrabold">{p.price.toLocaleString("fa-IR")}</span>
                    <span className="text-xs text-muted">تومان</span>
                    {percentOff(p.price, p.compare_price) ? (
                      <s className="ms-1 text-xs text-muted" aria-label={`قیمت قبل از تخفیف ${toman(p.compare_price)}`}>
                        {p.compare_price.toLocaleString("fa-IR")}
                      </s>
                    ) : null}
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
                          className="chip min-h-8 px-2.5 py-1 text-xs has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent"
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
