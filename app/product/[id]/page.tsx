import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, type Product, type Variant } from "@/lib/db";
import { SITE_URL, toman } from "@/lib/format";
import { addToCart } from "../../actions";
import { ErrorMessage } from "../../error-message";
import { ProductImage } from "../../product-image";
import { QtyStepper } from "../../qty-stepper";

const getProduct = (id: string) => db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(Number(id)) as Product | undefined;

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
  // Structured data, so Google can show the price and stock right in search results. Schema.org needs an ISO currency,
  // and the toman isn't one, so the price goes in rial (×10).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.image ? new URL(product.image, SITE_URL).href : undefined,
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

      <div className="grid gap-10 md:grid-cols-2">
        <ProductImage src={product.image} alt={product.name} className="aspect-[4/5] w-full rounded-3xl" />
        <div className="md:py-4">
          <ErrorMessage error={error} />
          <h1 className="text-3xl font-extrabold">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold text-accent">{toman(product.price)}</p>
          <p className="mt-6 leading-8 whitespace-pre-line text-muted">{product.description}</p>

          <form action={addToCart} className="mt-8 space-y-6">
            <fieldset>
              <legend className="mb-3 text-sm font-medium">سایز و رنگ</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <label
                    key={v.id}
                    className="chip has-checked:chip-active has-disabled:cursor-not-allowed has-disabled:line-through has-disabled:opacity-40 has-focus-visible:ring-2 has-focus-visible:ring-accent"
                    title={v.stock === 0 ? "ناموجود" : `موجودی: ${v.stock.toLocaleString("fa-IR")}`}
                  >
                    <input
                      type="radio"
                      name="variantId"
                      value={v.id}
                      disabled={v.stock === 0}
                      defaultChecked={v.id === firstInStock?.id}
                      required
                      className="sr-only"
                    />
                    {v.size} · {v.color}
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

          <p className="mt-8 border-t border-line pt-6 text-sm text-muted">پرداخت آنلاین با زرین‌پال یا پرداخت هنگام تحویل</p>
        </div>
      </div>
    </>
  );
}
