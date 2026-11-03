import { db, expireUnpaidOrders } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/format";
import { OrderCard, type Order } from "../order-card";
import { setOrderStatus } from "./actions";

export default async function AdminOrdersPage() {
  await requireAdmin();
  expireUnpaidOrders();
  // shortcut: newest 200 orders only, add pagination when there are more
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all() as Order[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">سفارش‌ها</h1>
      {orders.length === 0 ? <p className="text-muted">سفارشی ثبت نشده است.</p> : null}
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} showCustomer>
          {o.status === "cancelled" ? null : (
          <form action={setOrderStatus} className="flex gap-2">
            <input type="hidden" name="id" value={o.id} />
            <select name="status" defaultValue={o.status} aria-label="وضعیت" className="input w-auto">
              {Object.entries(ORDER_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className="btn">ذخیره</button>
          </form>
          )}
        </OrderCard>
      ))}
    </div>
  );
}
