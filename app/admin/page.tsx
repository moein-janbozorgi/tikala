import Link from "next/link";
import { db, expireUnpaidOrders, SOLD, TEHRAN } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { LOW_STOCK, ORDER_STATUSES, toman } from "@/lib/format";
import { likeContains, toLatinDigits } from "@/lib/validation";
import { OrderCard, type Order } from "../order-card";
import { deleteOrder, setOrderStatus } from "./actions";
import { ConfirmButton } from "./confirm-button";

const PAGE_SIZE = 30;

// The normal path of an order; any step can be clicked to jump to it.
const STEPS = ["pending", "processing", "shipped", "delivered"];


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
    where.push("name LIKE ? ESCAPE '\\'");
    args.push(likeContains(q));
  }
  const matching = (db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${where.join(" AND ")}`).get(...args) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page)) || 1));
  const orders = db
    .prepare(`SELECT * FROM orders WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Order[];
  /** This list (same status filter and search) at another page. */
  const pageLink = (n: number) => `/admin?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`.replace(/\?$/, "");
  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as { status: string; n: number }[]).map((r) => [r.status, r.n]),
  );
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS sum FROM orders WHERE ${SOLD} AND date(created_at, ${TEHRAN}) = date('now', ${TEHRAN})`)
    .get() as { n: number; sum: number };
  const lowStock = (
    db
      .prepare(`SELECT COUNT(DISTINCT v.product_id) AS n FROM variants v JOIN products p ON p.id = v.product_id WHERE p.active = 1 AND v.stock BETWEEN 1 AND ${LOW_STOCK}`)
      .get() as { n: number }
  ).n;
  const revenue = (db.prepare(`SELECT COALESCE(SUM(total), 0) AS sum FROM orders WHERE ${SOLD}`).get() as { sum: number }).sum;
  const here = pageLink(page);
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Link href="/admin/products?stock=low" className="card p-4 transition hover:border-ink">
          <p className="text-sm text-muted">کم‌موجودی</p>
          <p className={`mt-1 text-lg font-extrabold ${lowStock ? "text-danger" : ""}`}>{lowStock.toLocaleString("fa-IR")} محصول ←</p>
        </Link>
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
          <form action={setOrderStatus} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="back" value={here} />
            {o.status === "cancelled" || o.status === "awaiting_payment" ? null : (
              <div className="flex w-full flex-wrap items-center gap-2">
                <input
                  name="tracking_code"
                  defaultValue={o.tracking_code}
                  placeholder="کد رهگیری مرسوله"
                  aria-label={`کد رهگیری مرسوله سفارش ${o.id.toLocaleString("fa-IR")}`}
                  dir="ltr"
                  maxLength={30}
                  className="input w-56 py-1.5 text-base sm:text-sm"
                />
                <span className="text-xs text-muted">پیش از «ارسال شده» وارد کنید تا در پیامک مشتری بیاید.</span>
              </div>
            )}
            {o.status === "cancelled" ? null : (
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">مرحله سفارش {o.id.toLocaleString("fa-IR")}</legend>
                <ol className="flex flex-wrap items-center gap-1">
                  {/* Only checkout sets "awaiting payment"; it is shown just for orders that are in it. */}
                  {(o.status === "awaiting_payment" ? ["awaiting_payment", ...STEPS] : STEPS).map((s, i, steps) => {
                    const at = steps.indexOf(o.status);
                    return (
                      <li key={s} className="flex items-center gap-1">
                        {i > 0 ? <span aria-hidden className={`h-0.5 w-3 rounded-full ${i <= at ? "bg-ink" : "bg-line"}`} /> : null}
                        {/* Picking a step only selects it; «اعمال تغییرات» saves it. */}
                        <label
                          className={`chip cursor-pointer gap-1 px-3 py-1.5 text-xs has-checked:chip-active has-focus-visible:outline-2 has-focus-visible:outline-ink ${i < at ? `badge tone-${s} border-transparent` : i > at ? "text-muted" : ""}`}
                        >
                          <input type="radio" name="status" value={s} defaultChecked={i === at} className="sr-only" />
                          {i < at ? <span aria-hidden>✓</span> : null}
                          {ORDER_STATUSES[s]}
                        </label>
                      </li>
                    );
                  })}
                </ol>
                {/* The form's first button, so Enter in the tracking code field applies too. */}
                <button className="btn px-4 py-1.5 text-xs">اعمال تغییرات</button>
              </fieldset>
            )}
            <div className="ms-auto flex gap-2">
              <Link href={`/admin/orders/${o.id}/invoice`} target="_blank" className="btn-ghost px-3 py-1.5 text-xs">
                فاکتور
              </Link>
              {o.status === "cancelled" ? null : (
                <ConfirmButton
                  name="cancel"
                  value="1"
                  message={`سفارش #${o.id.toLocaleString("fa-IR")} لغو شود؟ اقلام به انبار برمی‌گردند و لغو قابل بازگشت نیست.`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  لغو سفارش
                </ConfirmButton>
              )}
              <ConfirmButton
                formAction={deleteOrder}
                message={`سفارش #${o.id.toLocaleString("fa-IR")} برای همیشه از پایگاه داده حذف شود؟ این کار قابل بازگشت نیست.`}
                className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
              >
                حذف
              </ConfirmButton>
            </div>
          </form>
        </OrderCard>
      ))}

      {pages > 1 ? (
        <nav aria-label="صفحه‌ها" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} className="btn-ghost">
              → قبلی
            </Link>
          ) : null}
          <span className="text-muted">
            صفحه {page.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}
          </span>
          {page < pages ? (
            <Link href={pageLink(page + 1)} className="btn-ghost">
              بعدی ←
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
