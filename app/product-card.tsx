import Link from "next/link";
import { percentOff, toman } from "@/lib/format";
import type { ProductWithStock } from "@/lib/products";
import { addToCart } from "./actions";
import { BagIcon } from "./icons";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";

/** A product in the shop grid, with a buy button (sizes and colors are picked on the product page). Rendered by the home page and by LoadMore. */
export function ProductCard({ product: p }: { product: ProductWithStock }) {
  const { variants } = p;
  return (
    <article className="group flex flex-col rounded-2xl border border-line bg-surface p-2 sm:p-2.5">
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
      {variants.length === 1 ? (
        <form action={addToCart} className="mt-auto flex items-center gap-1.5 px-0.5 pt-3 pb-0.5">
          <input type="hidden" name="variantId" value={variants[0].id} />
          <QtyStepper max={variants[0].stock} />
          <button className="btn min-w-0 flex-1 px-2">
            <span className="hidden sm:block">
              <BagIcon />
            </span>
            خرید
          </button>
        </form>
      ) : variants.length ? (
        // Several sizes/colors: the choice is made on the product page, never guessed here.
        <Link href={`/product/${p.id}`} className="btn mt-auto px-2">
          <span className="hidden sm:block">
            <BagIcon />
          </span>
          انتخاب سایز و خرید
        </Link>
      ) : (
        <p className="mt-auto px-1.5 pt-3 pb-2 text-xs text-muted">به‌زودی دوباره موجود می‌شود</p>
      )}
    </article>
  );
}
