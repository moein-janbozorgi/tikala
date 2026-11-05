import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, toman } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { Order } from "../../../../order-card";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "فاکتور", robots: { index: false } };

type Item = { id: number; product_name: string; size: string; color: string; price: number; qty: number };

/** One-page invoice / packing slip to print and put in the parcel. */
export default async function InvoicePage({ params }: PageProps<"/admin/orders/[id]/invoice">) {
  await requireAdmin();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number((await params).id)) as Order | undefined;
  if (!order) notFound();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(order.id) as Item[];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = order.total - subtotal + order.discount;
  const cell = "border border-line px-3 py-2";

  return (
    <article className="mx-auto max-w-2xl space-y-6 bg-surface p-6 text-sm print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-display text-3xl">تیکلا</p>
          <p className="text-muted">بوتیک آنلاین لباس</p>
        </div>
        <div className="text-left">
          <h1 className="text-lg font-bold">فاکتور فروش</h1>
          <p>شماره سفارش: {order.id.toLocaleString("fa-IR")}</p>
          <p>تاریخ: {date(order.created_at)}</p>
        </div>
      </header>

      <section className="space-y-1">
        <h2 className="font-bold">گیرنده</h2>
        <p>
          {order.name} — <span dir="ltr">{toPersianDigits(order.phone)}</span>
        </p>
        <p>{[order.province, order.city, order.address].filter(Boolean).join("، ")}</p>
        {order.postal_code ? (
          <p>
            کد پستی: <span dir="ltr">{toPersianDigits(order.postal_code)}</span>
          </p>
        ) : null}
      </section>

      <table className="w-full border-collapse text-right">
        <thead className="bg-surface-2">
          <tr>
            <th className={cell}>کالا</th>
            <th className={cell}>سایز / رنگ</th>
            <th className={cell}>تعداد</th>
            <th className={cell}>فی</th>
            <th className={cell}>مبلغ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className={cell}>{i.product_name}</td>
              <td className={cell}>
                {toPersianDigits(i.size)} / {i.color}
              </td>
              <td className={cell}>{i.qty.toLocaleString("fa-IR")}</td>
              <td className={cell}>{toman(i.price)}</td>
              <td className={cell}>{toman(i.price * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ms-auto w-full max-w-xs space-y-1">
        {[
          ["جمع کالاها", toman(subtotal)],
          ...(order.discount ? [[`تخفیف (${order.coupon})`, `− ${toman(order.discount)}`]] : []),
          ["هزینه ارسال", shipping ? toman(shipping) : "رایگان"],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
          <dt>مبلغ کل</dt>
          <dd>{toman(order.total)}</dd>
        </div>
      </dl>

      <p className="text-muted">
        {order.payment === "online" ? "پرداخت آنلاین (زرین‌پال)" : "پرداخت هنگام تحویل"}
        {order.ref_id ? (
          <>
            {" "}
            · کد پیگیری پرداخت: <span dir="ltr">{toPersianDigits(order.ref_id)}</span>
          </>
        ) : null}
        {order.tracking_code ? (
          <>
            {" "}
            · کد رهگیری مرسوله: <span dir="ltr">{toPersianDigits(order.tracking_code)}</span>
          </>
        ) : null}
      </p>
      <p className="text-center text-muted">از خرید شما سپاسگزاریم.</p>
      <div className="text-center">
        <PrintButton />
      </div>
    </article>
  );
}
