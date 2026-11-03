import { db, expireUnpaidOrders } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { payOrder } from "../actions";
import { ErrorMessage } from "../error-message";
import { OrderCard, type Order } from "../order-card";

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const { order, paid, error } = await searchParams;
  expireUnpaidOrders();
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").all(user.id) as Order[];

  return (
    <div className="space-y-4">
      {paid ? <p className="alert tone-success">پرداخت با موفقیت انجام شد و سفارش شما ثبت شد.</p> : null}
      {order && !paid && !error ? <p className="alert tone-success">سفارش شما با موفقیت ثبت شد.</p> : null}
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
    </div>
  );
}
