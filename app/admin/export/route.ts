import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_STATUSES } from "@/lib/format";
import { csv } from "@/lib/csv";

/** All orders as a CSV file that opens in Excel (UTF-8 with BOM, so Persian text shows correctly). Admin only. */
export async function GET() {
  await requireAdmin();
  const orders = (await db
    .prepare(
      `SELECT o.*, (SELECT group_concat(product_name || ' (' || size || ' / ' || color || ') × ' || qty, ' + ') FROM order_items WHERE order_id = o.id) AS items
       FROM orders o ORDER BY o.id DESC`,
    )
    .all()) as Record<string, string | number | null>[];
  const columns: [string, (o: Record<string, string | number | null>) => unknown][] = [
    ["شماره سفارش", (o) => o.id],
    ["تاریخ (UTC)", (o) => o.created_at],
    ["وضعیت", (o) => ORDER_STATUSES[String(o.status)] ?? o.status],
    ["مبلغ کل (تومان)", (o) => o.total],
    ["تخفیف (تومان)", (o) => o.discount],
    ["کد تخفیف", (o) => o.coupon],
    ["روش پرداخت", (o) => (o.payment === "online" ? "آنلاین" : "هنگام تحویل")],
    ["کد پیگیری پرداخت", (o) => o.ref_id],
    ["کد رهگیری مرسوله", (o) => o.tracking_code],
    ["نام گیرنده", (o) => o.name],
    ["موبایل", (o) => o.phone],
    ["استان", (o) => o.province],
    ["شهر", (o) => o.city],
    ["آدرس", (o) => o.address],
    ["کد پستی", (o) => o.postal_code],
    ["اقلام", (o) => o.items],
  ];
  const body = csv([columns.map(([title]) => title), ...orders.map((o) => columns.map(([, get]) => get(o)))]);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${body}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tikla-orders-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
