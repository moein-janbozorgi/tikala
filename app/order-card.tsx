import { db } from "@/lib/db";
import { date, ORDER_STATUSES, toman } from "@/lib/format";

export type Order = {
  id: number;
  status: string;
  total: number;
  name: string;
  phone: string;
  address: string;
  created_at: string;
  payment: string;
  ref_id: string | null;
};

type Item = { id: number; product_name: string; size: string; color: string; price: number; qty: number };

/** Order summary shared by the customer's account page and the admin panel; `children` holds extra controls. */
export function OrderCard({ order, showCustomer, children }: { order: Order; showCustomer?: boolean; children?: React.ReactNode }) {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as Item[];
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold">سفارش #{order.id.toLocaleString("fa-IR")}</span>
        <span className={`badge tone-${order.status}`}>{ORDER_STATUSES[order.status] ?? order.status}</span>
        <span className="text-sm text-muted">{date(order.created_at)}</span>
        <span className="ms-auto font-bold">{toman(order.total)}</span>
      </div>
      <ul className="space-y-1 text-sm text-muted">
        {items.map((i) => (
          <li key={i.id}>
            {i.product_name} ({i.size} / {i.color}) × {i.qty.toLocaleString("fa-IR")} — {toman(i.price * i.qty)}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {order.payment === "online" ? "پرداخت آنلاین" : "پرداخت هنگام تحویل"}
        {order.ref_id ? (
          <>
            {" "}
            · کد پیگیری: <span dir="ltr">{order.ref_id}</span>
          </>
        ) : null}
      </p>
      {showCustomer ? (
        <p className="border-t border-line pt-3 text-sm">
          {order.name} — <span dir="ltr">{order.phone}</span> — {order.address}
        </p>
      ) : null}
      {children}
    </div>
  );
}
