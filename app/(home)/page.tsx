import type { Metadata } from "next";
import Link from "next/link";
import { countSearch, db } from "@/lib/db";
import { listProducts, SORTS } from "@/lib/products";
import { ErrorMessage } from "../error-message";
import { FEATURES } from "../footer";
import { BagCheckArt, BagIcon, GlassesIcon, GridIcon, HoodieIcon, JacketIcon, PantsIcon, ShirtIcon, ShoeIcon, SweaterIcon, TshirtIcon } from "../icons";
import { LinkPending } from "../link-pending";
import { LoadMore } from "../load-more";
import { PriceRange } from "../price-range";
import { ProductCard } from "../product-card";

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
// A sort or sale chip's label while its list loads.
const PENDING_CHIP = "data-pending:animate-pulse data-pending:opacity-50 motion-reduce:animate-none";
const FALLBACK_COLORS = ["bg-violet-600", "bg-amber-500", "bg-cyan-600", "bg-fuchsia-600", "bg-blue-600"];

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
  const exists = !category || await db.prepare("SELECT 1 FROM products WHERE active = 1 AND category = ? AND (? IS NULL OR subcategory = ?)").get(category, type ?? null, type ?? null);
  const robots = typeof params.q === "string" || !exists ? { index: false, follow: true } : undefined;
  if (!category) return { alternates: { canonical }, robots };
  const name = type ? `${type} (${category})` : category;
  const description = `خرید ${type ?? category} مد روز از بوتیک تیکلا با انتخاب سایز و رنگ، پرداخت آنلاین یا هنگام تحویل و ارسال به سراسر ایران.`;
  return { title: name, description, alternates: { canonical }, robots, openGraph: { title: name, description, siteName: "تیکلا", locale: "fa_IR", url: canonical } };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const { products, total, page, pages, category, type, q, sort, sale, min, max, lo, hi } = await listProducts(params);
  const categories = (await db
    .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
    .all()) as { category: string }[];
  // Feeds «جستجوهای پرطرفدار». Only searches that found something, so that list only ever shows text from the shop.
  // shortcut: a reload counts again, so one visitor can lift a term; count once per session or IP if that gets abused.
  if (q && total && !params.page) await countSearch(q);
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
              {/* While the new list loads: a pulsing ring on the tapped category. */}
              <LinkPending
                className={`block rounded-full ring-offset-2 ring-offset-surface transition group-hover:scale-105 data-pending:animate-pulse data-pending:ring-2 data-pending:ring-accent motion-reduce:animate-none ${active ? "ring-2 ring-accent" : ""}`}
              >
                <span className={`grid size-14 place-items-center rounded-full text-white sm:size-16 [&_svg]:size-7 ${color}`}>
                  <CategoryIcon />
                </span>
              </LinkPending>
              <span className={`line-clamp-2 text-center text-xs leading-5 ${active ? "font-bold text-accent" : "font-medium"}`}>
                {c.category || "همه"}
              </span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="مرتب‌سازی" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="hidden text-muted sm:inline">مرتب‌سازی:</span>
        {Object.entries(SORTS).map(([value, [label]]) => (
          <Link
            key={value}
            href={link({ sort: value === "new" ? undefined : value })}
            scroll={false}
            aria-current={sort === value ? "true" : undefined}
            className={`chip px-3 py-1 ${sort === value ? "chip-active" : ""}`}
          >
            <LinkPending className={PENDING_CHIP}>{label}</LinkPending>
          </Link>
        ))}
        <Link
          href={link({ sale: sale ? undefined : "1" })}
          scroll={false}
          aria-current={sale ? "true" : undefined}
          className={`chip gap-1 px-3 py-1 ${sale ? "border-danger bg-danger text-page" : "text-danger"}`}
        >
          <LinkPending className={PENDING_CHIP}>حراج</LinkPending>
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
          <Link href={link({ q: undefined })} className="text-accent underline underline-offset-4">
            پاک کردن جستجو
          </Link>
        </p>
      ) : null}
      {products.length === 0 ? <p className="py-16 text-center text-muted">محصولی یافت نشد.</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {products.map((p, i) => (
          // The first row is on screen at load: its photos (the likely LCP) skip lazy loading.
          <ProductCard key={p.id} product={p} eager={i < 4} />
        ))}
      </div>

      {page < pages ? <LoadMore key={`${link({})}|${page}`} href={link({ page: page + 1 })} api={`/api/products${link({}).slice(1)}`} page={page + 1} /> : null}
    </>
  );
}