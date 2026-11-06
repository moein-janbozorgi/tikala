import Link from "next/link";
import { percentOff, toman } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { ProductWithStock } from "@/lib/products";
import { addToCart } from "./actions";
import { BagIcon } from "./icons";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";

/** A product in the shop grid, with its in-stock sizes and a buy button. Rendered by the home page and by LoadMore. */
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
                  {toPersianDigits(v.size)} · {v.color}
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
}
