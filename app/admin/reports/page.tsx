import { requireAdmin } from "@/lib/auth";
import { db, SOLD, TEHRAN } from "@/lib/db";
import { toman } from "@/lib/format";

type Day = { day: string; orders: number; revenue: number };

const persianDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("fa-IR", { weekday: "short", day: "numeric", month: "long" });
const persianMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long" });

/** Sales per day (last 30 days), per Persian-calendar month (last year), and the best sellers. Sold = not cancelled or unpaid. */
export default async function AdminReportsPage() {
  await requireAdmin();
  const days = (await db
    .prepare(
      `SELECT date(created_at, ${TEHRAN}) AS day, COUNT(*) AS orders, SUM(total) AS revenue FROM orders
       WHERE ${SOLD} AND created_at >= datetime('now', '-400 days') GROUP BY day ORDER BY day DESC`,
    )
    .all()) as Day[];
  // Persian months don't line up with Gregorian ones, so days are grouped in JavaScript by their Persian month.
  const months: { month: string; orders: number; revenue: number }[] = [];
  for (const d of days) {
    const month = persianMonth.format(new Date(`${d.day}T12:00:00Z`));
    if (months.at(-1)?.month !== month) months.push({ month, orders: 0, revenue: 0 });
    months.at(-1)!.orders += d.orders;
    months.at(-1)!.revenue += d.revenue;
  }
  const since30 = new Date(Date.now() + 210 * 60_000 - 29 * 86_400_000).toISOString().slice(0, 10);
  const last30 = days.filter((d) => d.day >= since30);
  const best = (await db
    .prepare(
      `SELECT product_name AS name, SUM(qty) AS qty, SUM(price * qty) AS revenue FROM order_items
       WHERE order_id IN (SELECT id FROM orders WHERE ${SOLD})
       GROUP BY product_name ORDER BY qty DESC, revenue DESC LIMIT 10`,
    )
    .all()) as { name: string; qty: number; revenue: number }[];
  const sum30 = last30.reduce((a, d) => ({ orders: a.orders + d.orders, revenue: a.revenue + d.revenue }), { orders: 0, revenue: 0 });
  const th = "px-3 py-2 text-start font-medium text-muted";
  const td = "px-3 py-2";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">گزارش فروش</h1>
        {/* A plain link: it's a file download, not a page. */}
        <a href="/admin/export" download className="btn-ghost">
          خروجی اکسل سفارش‌ها (CSV)
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["فروش ۳۰ روز اخیر", toman(sum30.revenue)],
          ["سفارش‌های ۳۰ روز اخیر", `${sum30.orders.toLocaleString("fa-IR")} سفارش`],
          ["میانگین هر سفارش", sum30.orders ? toman(Math.round(sum30.revenue / sum30.orders)) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-lg font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-bold">پرفروش‌ترین محصولات</h2>
        {best.length ? (
          <table className="mt-2 w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <th className={th}>محصول</th>
                <th className={th}>تعداد فروش</th>
                <th className={th}>مبلغ فروش</th>
              </tr>
            </thead>
            <tbody>
              {best.map((b) => (
                <tr key={b.name} className="border-b border-line last:border-0">
                  <td className={td}>{b.name}</td>
                  <td className={td}>{b.qty.toLocaleString("fa-IR")}</td>
                  <td className={td}>{toman(b.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-muted">هنوز فروشی ثبت نشده است.</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { title: "فروش روزانه (۳۰ روز اخیر)", rows: last30.map((d) => ({ key: d.day, label: persianDay(d.day), orders: d.orders, revenue: d.revenue })) },
          { title: "فروش ماهانه", rows: months.slice(0, 12).map((m) => ({ key: m.month, label: m.month, orders: m.orders, revenue: m.revenue })) },
        ].map((t) => (
          <section key={t.title} className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 font-bold">{t.title}</h2>
            {t.rows.length ? (
              <table className="mt-2 w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>سفارش</th>
                    <th className={th}>مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.key} className="border-b border-line last:border-0">
                      <td className={td}>{r.label}</td>
                      <td className={td}>{r.orders.toLocaleString("fa-IR")}</td>
                      <td className={td}>{toman(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-4 text-sm text-muted">در این بازه فروشی نبوده است.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
