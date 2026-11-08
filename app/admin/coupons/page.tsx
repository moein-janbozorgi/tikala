import { requireAdmin } from "@/lib/auth";
import { db, type Coupon } from "@/lib/db";
import { toman } from "@/lib/format";
import { MAX_PRICE } from "@/lib/validation";
import { ErrorMessage } from "../../error-message";
import { FieldError, ValidatedForm } from "../../validated-form";
import { addCoupon, deleteCoupon, toggleCoupon } from "../actions";
import { ConfirmButton } from "../confirm-button";

const persianDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("fa-IR");

export default async function AdminCouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  await requireAdmin();
  const { error, saved } = await searchParams;
  const coupons = (await db.prepare("SELECT * FROM coupons ORDER BY created_at DESC, code").all()) as Coupon[];

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-2xl font-extrabold">کدهای تخفیف</h1>
      {saved ? <p className="alert tone-success">کد تخفیف ساخته شد.</p> : null}
      <ErrorMessage error={error} />

      <ValidatedForm action={addCoupon} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">کد</span>
          <input name="code" required minLength={3} maxLength={20} pattern="[A-Za-z0-9\-]{3,20}" title="۳ تا ۲۰ حرف انگلیسی، عدد یا «-»" placeholder="YALDA30" dir="ltr" className="input uppercase" />
          <FieldError name="code" label="کد" />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">نوع تخفیف</legend>
          <div className="flex gap-2">
            <label className="chip has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent">
              <input type="radio" name="kind" value="percent" defaultChecked className="sr-only" />
              درصدی
            </label>
            <label className="chip has-checked:chip-active has-focus-visible:ring-2 has-focus-visible:ring-accent">
              <input type="radio" name="kind" value="amount" className="sr-only" />
              مبلغ ثابت
            </label>
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">مقدار (درصد ۱ تا ۹۰، یا مبلغ به تومان)</span>
          <input name="value" type="number" required min={1} max={MAX_PRICE} step={1} dir="ltr" className="input" />
          <FieldError name="value" label="مقدار" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">حداقل خرید (تومان، اختیاری)</span>
          <input name="min_total" type="number" min={0} max={MAX_PRICE} step={1} dir="ltr" className="input" />
          <FieldError name="min_total" label="حداقل خرید" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">حداکثر تعداد استفاده (اختیاری)</span>
          <input name="max_uses" type="number" min={1} max={1000000} step={1} dir="ltr" className="input" />
          <FieldError name="max_uses" label="حداکثر تعداد استفاده" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">آخرین روز اعتبار (اختیاری)</span>
          <input name="expires_on" type="date" dir="ltr" className="input" />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button className="btn">ساخت کد تخفیف</button>
        </div>
      </ValidatedForm>
      <p className="text-sm text-muted">
        تخفیف روی جمع کالاها حساب می‌شود و هزینه ارسال بر اساس مبلغ بعد از تخفیف است. سفارشی که لغو شود، یک بار استفاده را به کد برمی‌گرداند.
      </p>

      {coupons.length === 0 ? <p className="py-10 text-center text-muted">هنوز کد تخفیفی ساخته نشده است.</p> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {coupons.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-3 p-4">
            <span dir="ltr" className="font-mono font-bold">
              {c.code}
            </span>
            <span className={`badge ${c.active ? "tone-success" : "tone-cancelled"}`}>{c.active ? "فعال" : "غیرفعال"}</span>
            <span className="text-sm">{c.percent ? `${c.percent.toLocaleString("fa-IR")}٪ تخفیف` : `${toman(c.amount)} تخفیف`}</span>
            <span className="text-sm text-muted">
              {[
                c.min_total ? `خرید از ${toman(c.min_total)}` : "",
                `${c.used.toLocaleString("fa-IR")}${c.max_uses === null ? "" : ` از ${c.max_uses.toLocaleString("fa-IR")}`} بار استفاده`,
                c.expires_on ? `تا ${persianDate(c.expires_on)}` : "بدون تاریخ انقضا",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="ms-auto flex gap-1">
              <form action={toggleCoupon}>
                <input type="hidden" name="code" value={c.code} />
                <button className="btn-ghost px-3 py-1.5 text-sm">{c.active ? "غیرفعال کردن" : "فعال کردن"}</button>
              </form>
              <form action={deleteCoupon}>
                <input type="hidden" name="code" value={c.code} />
                <ConfirmButton message={`کد تخفیف «${c.code}» حذف شود؟`} className="btn-ghost px-3 py-1.5 text-sm text-danger hover:bg-danger/10">
                  حذف
                </ConfirmButton>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
