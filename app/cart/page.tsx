import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getCartLines, getCouponCode } from "@/lib/cart";
import { couponDiscount, db } from "@/lib/db";
import { getFlash } from "@/lib/flash";
import { toPersianDigits } from "@/lib/phone";
import { NAME_PATTERN, NAME_RULE } from "@/lib/rules";
import { FREE_SHIPPING_FROM, shippingCost, toman } from "@/lib/format";
import { applyCoupon, checkout, updateCartItem } from "../actions";
import { FieldError, ValidatedForm } from "../validated-form";
import { SubmitButton } from "../submit-button";
import { AddressFields } from "./address-fields";
import { ErrorMessage } from "../error-message";
import { BagIcon, MinusIcon, PlusIcon, TrashIcon } from "../icons";
import { ProductImage } from "../product-image";

export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const { error } = await searchParams;
  const lines = await getCartLines();
  const user = await getUser();
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  // The applied discount code is re-checked on every visit: it may have expired or run out since.
  const coupon = await getCouponCode();
  const couponResult = coupon && lines.length ? await couponDiscount(coupon, total) : null;
  const discount = couponResult && "discount" in couponResult ? couponResult.discount : 0;
  const shipping = shippingCost(total - discount);
  // What the customer typed last time, if the server sent the form back with an error.
  // Otherwise the details of their last order, so a returning customer doesn't retype the address.
  const last = user
    ? ((await db.prepare("SELECT name, phone, province, city, postal_code, address FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(user.id)) as
        | Record<string, string>
        | undefined)
    : undefined;
  const typed: Record<string, string | undefined> = { ...last, ...(await getFlash("checkout")) };

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
          {lines.map((l, i) => {
            // Each button submits the quantity it leads to, so it works without JavaScript and a double click can't
            // count twice. If stock dropped below the cart amount, one tap on − brings it down to what's available.
            const less = Math.min(l.qty - 1, l.stock);
            return (
              <li key={l.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <Link href={`/product/${l.product_id}`} className="shrink-0">
                  <ProductImage src={l.image} alt={l.name} sizes="96px" eager={i === 0} className="size-20 rounded-xl sm:size-24" />
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/product/${l.product_id}`} className="line-clamp-1 font-medium hover:text-accent">
                    {l.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {toPersianDigits(l.size)} · {l.color}
                  </p>
                  {l.qty > l.stock ? (
                    <p className="text-sm text-danger">فقط {l.stock.toLocaleString("fa-IR")} عدد موجود است</p>
                  ) : l.qty > 1 ? (
                    <p className="text-xs text-muted">هر عدد {toman(l.price)}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <form action={updateCartItem} className="flex items-center rounded-full border border-line bg-page p-0.5">
                      <input type="hidden" name="variantId" value={l.id} />
                      <button
                        name="qty"
                        value={l.qty + 1}
                        disabled={l.qty >= l.stock}
                        aria-label="افزایش تعداد"
                        className="grid size-8 place-items-center rounded-full text-accent transition hover:bg-surface-2 disabled:text-muted disabled:opacity-30"
                      >
                        <PlusIcon />
                      </button>
                      <output aria-label="تعداد" className="w-8 text-center font-bold">
                        {l.qty.toLocaleString("fa-IR")}
                      </output>
                      <button
                        name="qty"
                        value={less}
                        aria-label={less > 0 ? "کاهش تعداد" : "حذف از سبد خرید"}
                        title={less > 0 ? undefined : "حذف از سبد خرید"}
                        className={`grid size-8 place-items-center rounded-full transition hover:bg-surface-2 ${less > 0 ? "text-accent" : "text-danger"}`}
                      >
                        {less > 0 ? <MinusIcon /> : <TrashIcon />}
                      </button>
                    </form>
                    <p className="font-bold">{toman(l.price * l.qty)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card h-fit space-y-5 lg:sticky lg:top-24">
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-muted">جمع کالاها</span>
            <span>{toman(total)}</span>
          </p>
          {discount ? (
            <p className="flex justify-between text-success">
              <span>
                تخفیف (<span dir="ltr">{coupon}</span>)
              </span>
              <span>− {toman(discount)}</span>
            </p>
          ) : null}
          <p className="flex justify-between">
            <span className="text-muted">هزینه ارسال</span>
            {shipping ? <span>{toman(shipping)}</span> : <span className="font-medium text-success">رایگان</span>}
          </p>
          {shipping ? (
            <p className="text-xs text-muted">با {toman(FREE_SHIPPING_FROM - (total - discount))} خرید بیشتر، ارسال رایگان می‌شود.</p>
          ) : null}
        </div>
        <form action={applyCoupon} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              name="code"
              defaultValue={coupon}
              placeholder="کد تخفیف"
              aria-label="کد تخفیف"
              dir="ltr"
              maxLength={20}
              autoComplete="off"
              className="input py-2 text-base uppercase sm:text-sm"
            />
            <button className="btn-ghost shrink-0">اعمال</button>
            {coupon ? (
              <button name="remove" value="1" className="btn-ghost shrink-0 text-danger" aria-label="حذف کد تخفیف">
                حذف
              </button>
            ) : null}
          </div>
          {couponResult && "error" in couponResult ? <p className="text-xs text-danger">{couponResult.error}</p> : null}
        </form>
        <p className="flex justify-between border-t border-line pt-4 text-lg font-bold">
          <span>مبلغ قابل پرداخت</span>
          <span>{toman(total - discount + shipping)}</span>
        </p>
        {user ? (
          <ValidatedForm action={checkout} className="space-y-4 border-t border-line pt-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">نام گیرنده</span>
              <input name="name" defaultValue={typed.name ?? user.name} required maxLength={30} pattern={NAME_PATTERN} title={NAME_RULE} autoComplete="name" className="input" />
              <FieldError name="name" label="نام گیرنده" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">شماره موبایل</span>
              <input
                name="phone"
                defaultValue={toPersianDigits(typed.phone ?? user.phone ?? "")}
                placeholder={toPersianDigits("09121234567")}
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                required
                data-check="phone"
                className="input text-right"
              />
              <FieldError name="phone" label="شماره موبایل" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <AddressFields province={typed.province} city={typed.city} />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">آدرس کامل</span>
              <textarea
                name="address"
                defaultValue={typed.address}
                placeholder="خیابان، کوچه، پلاک، واحد"
                required
                minLength={10}
                maxLength={300}
                rows={3}
                autoComplete="street-address"
                className="input"
              />
              <FieldError name="address" label="آدرس کامل" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">کد پستی (۱۰ رقم)</span>
              <input
                name="postal_code"
                defaultValue={toPersianDigits(typed.postal_code ?? "")}
                inputMode="numeric"
                autoComplete="postal-code"
                dir="ltr"
                required
                pattern="[\s\-0-9۰-۹]{10,12}"
                title="کد پستی باید ۱۰ رقم باشد."
                className="input text-right"
              />
              <FieldError name="postal_code" label="کد پستی" />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">روش پرداخت</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  ["online", "پرداخت آنلاین (زرین‌پال)"],
                  ["cod", "پرداخت هنگام تحویل"],
                ].map(([value, label]) => (
                  <label key={value} className="chip has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent">
                    <input type="radio" name="payment" value={value} defaultChecked={value === (typed.payment || "online")} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton className="btn w-full">ثبت سفارش و پرداخت</SubmitButton>
          </ValidatedForm>
        ) : (
          <Link href="/cart?auth=login" scroll={false} className="btn w-full">
            برای ثبت سفارش وارد شوید
          </Link>
        )}
      </div>
    </div>
  );
}
