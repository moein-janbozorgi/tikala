import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getCartLines } from "@/lib/cart";
import { toman } from "@/lib/format";
import { checkout, updateCartItem } from "../actions";
import { ErrorMessage } from "../error-message";
import { BagIcon } from "../icons";
import { ProductImage } from "../product-image";

export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const { error } = await searchParams;
  const lines = await getCartLines();
  const user = await getUser();
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ErrorMessage error={error} />
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-surface-2 text-muted">
          <BagIcon />
        </div>
        <p className="mt-4 text-lg font-medium">سبد خرید شما خالی است</p>
        <Link href="/" className="btn mt-6">
          مشاهده محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-6 text-2xl font-extrabold">سبد خرید</h1>
        <ErrorMessage error={error} />
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <ProductImage src={l.image} alt={l.name} className="size-20 rounded-xl" />
              <div className="min-w-32 flex-1">
                <Link href={`/product/${l.product_id}`} className="font-medium hover:text-accent">
                  {l.name}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {l.size} · {l.color}
                </p>
                <p className="mt-1 text-sm font-bold">{toman(l.price * l.qty)}</p>
                {l.qty > l.stock ? <p className="mt-1 text-sm text-danger">فقط {l.stock.toLocaleString("fa-IR")} عدد موجود است</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <form action={updateCartItem} className="flex items-center gap-2">
                  <input type="hidden" name="variantId" value={l.id} />
                  <input name="qty" type="number" min={0} max={l.stock} defaultValue={l.qty} aria-label="تعداد" className="input w-16 px-2 text-center" />
                  <button className="btn-ghost">به‌روزرسانی</button>
                </form>
                <form action={updateCartItem}>
                  <input type="hidden" name="variantId" value={l.id} />
                  <input type="hidden" name="qty" value={0} />
                  <button className="rounded-full px-3 py-2 text-sm text-danger hover:bg-surface-2">حذف</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card h-fit space-y-5 lg:sticky lg:top-24">
        <p className="flex justify-between text-lg font-bold">
          <span>جمع کل</span>
          <span>{toman(total)}</span>
        </p>
        {user ? (
          <form action={checkout} className="space-y-4 border-t border-line pt-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">نام گیرنده</span>
              <input name="name" defaultValue={user.name} required className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">شماره موبایل</span>
              <input name="phone" placeholder="09121234567" inputMode="numeric" dir="ltr" required className="input text-right" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">آدرس کامل و کد پستی</span>
              <textarea name="address" required rows={3} className="input" />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">روش پرداخت</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  ["online", "پرداخت آنلاین (زرین‌پال)"],
                  ["cod", "پرداخت هنگام تحویل"],
                ].map(([value, label]) => (
                  <label key={value} className="chip has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent">
                    <input type="radio" name="payment" value={value} defaultChecked={value === "online"} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn w-full">ثبت سفارش و پرداخت</button>
          </form>
        ) : (
          <Link href="/login?next=/cart" className="btn w-full">
            برای ثبت سفارش وارد شوید
          </Link>
        )}
      </div>
    </div>
  );
}
