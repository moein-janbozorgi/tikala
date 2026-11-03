import Image from "next/image";
import Link from "next/link";
import { db, type Product, type Variant } from "@/lib/db";
import { toman } from "@/lib/format";
import { addToCart } from "./actions";
import { ErrorMessage } from "./error-message";
import { ProductImage } from "./product-image";
import { QtyStepper } from "./qty-stepper";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { category, error } = await searchParams;
  const categories = db
    .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
    .all() as { category: string }[];
  const products = (
    typeof category === "string"
      ? db.prepare("SELECT * FROM products WHERE active = 1 AND category = ? ORDER BY id DESC").all(category)
      : db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY id DESC").all()
  ) as Product[];
  const inStock = Map.groupBy(db.prepare("SELECT * FROM variants WHERE stock > 0 ORDER BY id").all() as Variant[], (v) => v.product_id);

  return (
    <>
      <ErrorMessage error={error} />
      {category ? null : (
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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href="/" className={`chip ${!category ? "chip-active" : ""}`}>
          همه
        </Link>
        {categories.map((c) => (
          <Link
            key={c.category}
            href={`/?category=${encodeURIComponent(c.category)}`}
            className={`chip ${category === c.category ? "chip-active" : ""}`}
          >
            {c.category}
          </Link>
        ))}
      </div>

      {products.length === 0 ? <p className="py-16 text-center text-muted">محصولی یافت نشد.</p> : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => {
          const variants = inStock.get(p.id) ?? [];
          return (
            <div key={p.id} className="flex flex-col">
              <Link href={`/product/${p.id}`} className="group block">
                <div className="relative overflow-hidden rounded-2xl">
                  <ProductImage src={p.image} alt={p.name} className="aspect-[4/5] w-full transition duration-500 group-hover:scale-105" />
                  {variants.length === 0 ? <span className="badge tone-danger absolute top-3 right-3 bg-surface">ناموجود</span> : null}
                </div>
                <p className="mt-3 text-xs text-muted">{p.category}</p>
                <h2 className="mt-1 font-medium group-hover:text-accent">{p.name}</h2>
                <p className="mt-1 text-sm font-bold">{toman(p.price)}</p>
              </Link>
              {variants.length === 0 ? null : (
                <form action={addToCart} className="mt-auto space-y-2 pt-3">
                  {variants.length > 1 ? (
                    <select name="variantId" aria-label={`سایز و رنگ ${p.name}`} className="input py-1.5 text-sm">
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.size} · {v.color}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="hidden" name="variantId" value={variants[0].id} />
                  )}
                  <div className="flex items-center gap-2">
                    <QtyStepper max={Math.max(...variants.map((v) => v.stock))} />
                    <button className="btn min-w-0 flex-1 px-3">خرید</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
