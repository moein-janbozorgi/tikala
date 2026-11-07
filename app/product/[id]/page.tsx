import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, type Product, type Variant } from "@/lib/db";
import { percentOff, SITE_URL, toman } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { addToCart } from "../../actions";
import { ErrorMessage } from "../../error-message";
import { ProductImage } from "../../product-image";
import { QtyStepper } from "../../qty-stepper";
import { getProduct } from "./get-product";

export async function generateMetadata({ params }: PageProps<"/product/[id]">): Promise<Metadata> {
  const product = getProduct((await params).id);
  if (!product) return {};
  const description = product.description.slice(0, 160) || `${product.name} — ${toman(product.price)}`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/product/${product.id}` },
    // Nested metadata replaces the layout's openGraph object, so siteName and locale are repeated.
    openGraph: { title: product.name, description, siteName: "تیکلا", locale: "fa_IR", images: product.image ? [product.image] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/product/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const product = getProduct(id);
  if (!product) notFound();
  const variants = db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY id").all(product.id) as Variant[];
  const firstInStock = variants.find((v) => v.stock > 0);
  const gallery = [
    { path: product.image, color: "" },
    ...(db.prepare("SELECT path, color FROM product_images WHERE product_id = ? ORDER BY id").all(product.id) as { path: string; color: string }[]),
  ].filter((p) => p.path);
  const photos = gallery.map((p) => p.path);
  // Colors by index (CSS-safe). Picking a color shows only its photos, or only the untagged photos (data-pc="") when it
  // has none. Each color gets its own set, so the slide the gallery is snapped to always belongs to the picked color
  // (with photos merely reordered, scroll-snap kept the old slide in view). Plain CSS (:has), so no JavaScript needed.
  const colors = [...new Set(variants.map((v) => v.color))];
  const colorOf = (color: string) => (colors.includes(color) ? String(colors.indexOf(color)) : "");
  const untagged = gallery.some((p) => colorOf(p.color) === "");
  const colorCss = colors
    .map((c, k) => {
      const shown = gallery.some((p) => p.color === c) ? String(k) : untagged ? "" : null;
      return shown === null ? "" : `#product:has([data-c="${k}"]:checked) [data-pc]:not([data-pc="${shown}"]){display:none}`;
    })
    .join("");
  // Sizes missing or sold out in the picked color are crossed out (same CSS-only approach).
  const sizes = [...new Set(variants.map((v) => v.size))];
  const soldOut = colors.flatMap((c, k) =>
    sizes.flatMap((s, j) => (variants.some((v) => v.color === c && v.size === s && v.stock > 0) ? [] : [`#product:has([data-c="${k}"]:checked) [data-s="${j}"]`])),
  );
  const pickerCss = colorCss + (soldOut.length ? `${soldOut.join(",")}{text-decoration:line-through;opacity:.4;pointer-events:none}` : "");
  const off = percentOff(product.price, product.compare_price);
  const sizeGuide = product.category
    ? ((db.prepare("SELECT size_guide FROM categories WHERE name = ?").get(product.category) as { size_guide: string } | undefined)?.size_guide ?? "")
    : "";
  // Same category, in-stock ones first, closest in price.
  const related = product.category
    ? (db
        .prepare(
          `SELECT p.* FROM products p WHERE p.active = 1 AND p.category = ? AND p.id != ?
           ORDER BY EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0) DESC, ABS(p.price - ?) LIMIT 4`,
        )
        .all(product.category, product.id, product.price) as Product[])
    : [];
  // Structured data, so Google can show the price and stock right in search results. Schema.org needs an ISO currency,
  // and the toman isn't one, so the price goes in rial (×10).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: photos.length ? photos.map((src) => new URL(src, SITE_URL).href) : undefined,
    sku: String(product.id),
    category: product.category || undefined,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/product/${product.id}`,
      price: product.price * 10,
      priceCurrency: "IRR",
      availability: firstInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      {/* "<" escaped so text in a product name or description can't close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-6 flex gap-2 text-sm text-muted" aria-label="مسیر">
        <Link href="/" className="hover:text-ink">
          خانه
        </Link>
        {product.category ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/?category=${encodeURIComponent(product.category)}`} className="hover:text-ink">
              {product.category}
            </Link>
          </>
        ) : null}
      </nav>

      {pickerCss ? <style>{pickerCss}</style> : null}
      <div id="product" className="grid gap-10 md:grid-cols-2">
        {/* Gallery: swipe (or scroll) between photos; thumbnails jump to one. Plain links and CSS, so no JavaScript needed. */}
        <div className="min-w-0">
          <div className="relative">
            <div className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl [scrollbar-width:none]">
              {(photos.length ? photos : [""]).map((src, i) => (
                <div key={i} id={`photo-${i + 1}`} data-pc={colorOf(gallery[i]?.color ?? "")} className="w-full shrink-0 snap-center scroll-mt-24">
                  <ProductImage src={src} alt={i ? `${product.name}، تصویر ${(i + 1).toLocaleString("fa-IR")}` : product.name} sizes="(min-width: 1152px) 540px, (min-width: 768px) 50vw, 100vw" eager={i === 0} className="aspect-4/5 w-full" />
                </div>
              ))}
            </div>
            {off ? (
              <span className="absolute top-4 left-4 rounded-full bg-danger px-3 py-1.5 text-sm font-bold text-page">
                {`${off.toLocaleString("fa-IR")}٪ تخفیف`}
              </span>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <nav aria-label="تصاویر محصول" className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {photos.map((src, i) => (
                <a key={i} href={`#photo-${i + 1}`} data-pc={colorOf(gallery[i].color)} aria-label={`تصویر ${(i + 1).toLocaleString("fa-IR")}`} className="shrink-0 rounded-xl ring-accent hover:ring-2">
                  <ProductImage src={src} alt="" sizes="80px" className="size-16 rounded-xl sm:size-20" />
                </a>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="md:py-4">
          <ErrorMessage error={error} />
          <h1 className="text-3xl font-extrabold">{product.name}</h1>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="text-2xl font-bold text-accent">{toman(product.price)}</span>
            {off ? (
              <s className="text-muted" aria-label={`قیمت قبل از تخفیف ${toman(product.compare_price)}`}>
                {toman(product.compare_price)}
              </s>
            ) : null}
          </p>
          <p className="mt-6 leading-8 whitespace-pre-line text-muted">{product.description}</p>

          <form action={addToCart} className="mt-8 space-y-6">
            <input type="hidden" name="productId" value={product.id} />
            <fieldset>
              <legend className="mb-3 text-sm font-medium">رنگ</legend>
              <div className="flex flex-wrap gap-2">
                {colors.map((c, k) => (
                  <label key={c} className={CHIP}>
                    <input
                      type="radio"
                      name="color"
                      value={c}
                      data-c={k}
                      disabled={!variants.some((v) => v.color === c && v.stock > 0)}
                      defaultChecked={c === firstInStock?.color}
                      required
                      className="sr-only"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">سایز</legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s, j) => (
                  <label key={s} data-s={j} className={CHIP}>
                    <input
                      type="radio"
                      name="size"
                      value={s}
                      disabled={!variants.some((v) => v.size === s && v.stock > 0)}
                      defaultChecked={s === firstInStock?.size}
                      required
                      className="sr-only"
                    />
                    {toPersianDigits(s)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-3">
              {firstInStock ? <QtyStepper max={Math.max(...variants.map((v) => v.stock))} /> : null}
              <button className="btn px-8" disabled={!firstInStock}>
                {firstInStock ? "خرید" : "ناموجود"}
              </button>
            </div>
          </form>

          {sizeGuide ? <SizeGuide text={sizeGuide} /> : null}
          <p className="mt-8 border-t border-line pt-6 text-sm text-muted">پرداخت آنلاین با زرین‌پال یا پرداخت هنگام تحویل</p>
        </div>
      </div>

      {related.length ? (
        <section className="mt-16">
          <h2 className="mb-4 text-xl font-extrabold">محصولات مشابه</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {related.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="group rounded-2xl border border-line bg-surface p-2">
                <ProductImage src={p.image} alt={p.name} sizes="(min-width: 1152px) 270px, (min-width: 640px) 25vw, 50vw" className="aspect-4/5 w-full rounded-xl" />
                <p className="mt-2 line-clamp-1 px-1 text-sm font-bold group-hover:text-accent">{p.name}</p>
                <p className="px-1 text-sm">
                  {toman(p.price)}
                  {percentOff(p.price, p.compare_price) ? (
                    <span className="ms-1.5 text-xs font-bold text-danger">{`${percentOff(p.price, p.compare_price).toLocaleString("fa-IR")}٪`}</span>
                  ) : null}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

const CHIP =
  "chip has-checked:chip-active has-disabled:cursor-not-allowed has-disabled:line-through has-disabled:opacity-40 has-focus-visible:ring-2 has-focus-visible:ring-accent";

/**
 * The category's size guide, written by the admin as lines of "cell | cell | …"; the first line is the header.
 * Lines without "|" are shown as notes under the table.
 */
function SizeGuide({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = lines.filter((l) => l.includes("|")).map((l) => l.split("|").map((c) => c.trim()));
  const notes = lines.filter((l) => !l.includes("|"));
  return (
    <details className="mt-6 rounded-2xl border border-line p-4">
      <summary className="cursor-pointer font-medium">راهنمای سایز</summary>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="border-b border-line">
                {rows[0].map((c, i) => (
                  <th key={i} className="px-2 py-2 font-bold">
                    {toPersianDigits(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-2">
                      {toPersianDigits(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {notes.map((n, i) => (
        <p key={i} className="mt-2 text-sm text-muted">
          {toPersianDigits(n)}
        </p>
      ))}
    </details>
  );
}
