import Link from "next/link";
import { db, expireUnpaidOrders } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES, toman } from "@/lib/format";
import { toLatinDigits } from "@/lib/validation";
import { OrderCard, type Order } from "../order-card";
import { setOrderStatus } from "./actions";

// Iran has no daylight saving time (since 2022), so "today" is UTC+3:30 all year.
const TEHRAN = "'+210 minutes'";
// Orders that count as sales: not cancelled and not still waiting for online payment.
const SOLD = "status NOT IN ('cancelled', 'awaiting_payment')";

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  expireUnpaidOrders();
  const params = await searchParams;
  const status = typeof params.status === "string" && params.status in ORDER_STATUSES ? params.status : undefined;
  const q = typeof params.q === "string" ? toLatinDigits(params.q.trim()).slice(0, 50) : "";

  const where = ["1"];
  const args: string[] = [];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  const digits = /^#?\d+$/.test(q) ? q.replace("#", "") : "";
  // A short number is an order number; from 4 digits it may also be part of a phone. Anything else searches names.
  if (digits.length >= 4) {
    where.push("(CAST(id AS TEXT) = ? OR phone LIKE ?)");
    args.push(digits, `%${digits}%`);
  } else if (digits) {
    where.push("CAST(id AS TEXT) = ?");
    args.push(digits);
  } else if (q) {
    where.push("name LIKE ?");
    args.push(`%${q}%`);
  }
  // shortcut: newest 200 matching orders only; add paging when the filters stop being enough.
  const orders = db.prepare(`SELECT * FROM orders WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 200`).all(...args) as Order[];
  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as { status: string; n: number }[]).map((r) => [r.status, r.n]),
  );
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS sum FROM orders WHERE ${SOLD} AND date(created_at, ${TEHRAN}) = date('now', ${TEHRAN})`)
    .get() as { n: number; sum: number };
  const revenue = (db.prepare(`SELECT COALESCE(SUM(total), 0) AS sum FROM orders WHERE ${SOLD}`).get() as { sum: number }).sum;
  const here = `/admin?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`.replace(/\?$/, "");
  const tab = (value: string | undefined, label: string, n: number) => (
    <Link
      key={value ?? "all"}
      href={`/admin?${new URLSearchParams({ ...(value ? { status: value } : {}), ...(q ? { q } : {}) })}`.replace(/\?$/, "")}
      className={`chip gap-1.5 ${status === value ? "chip-active" : ""}`}
    >
      {label}
      <span className="text-xs opacity-70">{n.toLocaleString("fa-IR")}</span>
    </Link>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">سفارش‌ها</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["سفارش‌های امروز", `${today.n.toLocaleString("fa-IR")} سفارش · ${toman(today.sum)}`],
          ["در انتظار بررسی", `${(counts.pending ?? 0).toLocaleString("fa-IR")} سفارش`],
          ["کل فروش", toman(revenue)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-lg font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <form action="/admin" role="search" className="flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input type="search" name="q" defaultValue={q} placeholder="شماره سفارش، نام یا موبایل مشتری…" aria-label="جستجوی سفارش" className="input" />
        <button className="btn shrink-0">جستجو</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tab(undefined, "همه", all)}
        {Object.entries(ORDER_STATUSES).map(([value, label]) => tab(value, label, counts[value] ?? 0))}
      </div>

      {orders.length === 0 ? <p className="py-10 text-center text-muted">سفارشی پیدا نشد.</p> : null}
      {orders.map((o) => (
        <OrderCard key={o.id} order={o}>
          {o.status === "cancelled" ? null : (
            <form action={setOrderStatus} className="flex gap-2">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="back" value={here} />
              <select name="status" defaultValue={o.status} aria-label="وضعیت" className="input w-auto">
                {Object.entries(ORDER_STATUSES)
                  // Only checkout sets "awaiting payment"; it stays listed just for orders that are in it.
                  .filter(([value]) => value !== "awaiting_payment" || o.status === value)
                  .map(([value, label]) => (
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
