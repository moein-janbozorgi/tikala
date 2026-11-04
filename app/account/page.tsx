import { db, expireUnpaidOrders } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { payOrder, requestCode, setPassword } from "../actions";
import { ErrorMessage } from "../error-message";
import { OrderCard, type Order } from "../order-card";
import { FieldError, ValidatedForm } from "../validated-form";

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const { order, paid, error, phone, password } = await searchParams;
  expireUnpaidOrders();
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").all(user.id) as Order[];

  return (
    <div className="space-y-4">
      {paid ? <p className="alert tone-success">پرداخت با موفقیت انجام شد و سفارش شما ثبت شد.</p> : null}
      {order && !paid && !error ? <p className="alert tone-success">سفارش شما با موفقیت ثبت شد.</p> : null}
      {phone ? <p className="alert tone-success">شماره موبایل به حساب شما اضافه شد.</p> : null}
      {password ? <p className="alert tone-success">رمز عبور ذخیره شد.</p> : null}
      <ErrorMessage error={error} />
      <h1 className="text-2xl font-extrabold">سفارش‌های من</h1>
      {orders.length === 0 ? <p className="text-muted">هنوز سفارشی ثبت نکرده‌اید.</p> : null}
      {orders.map((o) => (
        <OrderCard key={o.id} order={o}>
          {o.status === "awaiting_payment" ? (
            <form action={payOrder}>
              <input type="hidden" name="orderId" value={o.id} />
              <button className="btn">پرداخت آنلاین</button>
            </form>
          ) : null}
        </OrderCard>
      ))}

      {/* Below the orders so the order forms stay first on the page. */}
      <h2 className="pt-6 text-xl font-extrabold">تنظیمات حساب</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <ValidatedForm action={requestCode} className="card space-y-3">
          <input type="hidden" name="purpose" value="link" />
          <h3 className="font-bold">شماره موبایل</h3>
          <p className="text-sm text-muted">
            {user.phone ? (
              <>
                شماره فعلی: <span dir="ltr">{user.phone}</span>. با آن می‌توانید با کد پیامکی وارد شوید.
              </>
            ) : (
              "شماره‌ای ثبت نشده است. با افزودن شماره، اگر رمز عبور را فراموش کنید هم می‌توانید وارد شوید."
            )}
          </p>
          <div>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09121234567" required data-check="phone" aria-label="شماره موبایل" className="input text-right" />
            <FieldError name="phone" label="شماره موبایل" />
          </div>
          <button className="btn-ghost">{user.phone ? "تغییر شماره" : "افزودن شماره"}</button>
        </ValidatedForm>

        {user.email ? (
          <ValidatedForm action={setPassword} className="card space-y-3">
            <h3 className="font-bold">{user.has_password ? "تغییر رمز عبور" : "تعیین رمز عبور"}</h3>
            <p className="text-sm text-muted">
              برای ورود با ایمیل <span dir="ltr">{user.email}</span>. ۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد.
            </p>
            <div>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                required
                minLength={8}
                maxLength={64}
                pattern="(?=.*\p{L})(?=.*\p{Nd}).{8,64}"
                title="۸ تا ۶۴ کاراکتر، شامل حداقل یک حرف و یک عدد"
                aria-label="رمز عبور جدید"
                placeholder="رمز عبور جدید"
                className="input"
              />
              <FieldError name="password" label="رمز عبور جدید" />
            </div>
            <div>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                required
                data-match="password"
                data-match-message="رمز عبور و تکرار آن یکسان نیستند."
                aria-label="تکرار رمز عبور جدید"
                placeholder="تکرار رمز عبور"
                className="input"
              />
              <FieldError name="confirm" label="تکرار رمز عبور" />
            </div>
            <button className="btn-ghost">ذخیره رمز عبور</button>
          </ValidatedForm>
        ) : null}
      </div>
    </div>
  );
}
