import { after, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { errorParam } from "@/lib/validation";
import { notifyOrder } from "@/lib/sms";
import { toRial, verifyPayment } from "@/lib/zarinpal";

// Zarinpal sends the customer back here with ?Authority=...&Status=OK|NOK. Nothing in the URL is trusted:
// the order is found by authority and the amount comes from the database.
export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const order = db.prepare("SELECT id, total, status FROM orders WHERE authority = ?").get(authority) as
    | { id: number; total: number; status: string }
    | undefined;
  if (!authority || !order) redirect(`/account?error=${errorParam("تراکنش پیدا نشد")}`);

  let error = "";
  // Only orders still awaiting payment are verified; an unverified payment is refunded by Zarinpal automatically.
  if (order!.status === "cancelled") {
    error = "این سفارش لغو شده است";
  } else if (order!.status === "awaiting_payment") {
    if (req.nextUrl.searchParams.get("Status") !== "OK") {
      error = "پرداخت انجام نشد. می‌توانید دوباره تلاش کنید.";
    } else {
      try {
        const refId = await verifyPayment(authority, toRial(order!.total));
        const paid = db.prepare("UPDATE orders SET status = 'pending', ref_id = ? WHERE id = ? AND status = 'awaiting_payment'").run(refId, order!.id);
        if (paid.changes) after(() => notifyOrder(order!.id, "paid"));
        else {
          // Expired (cancelled) while Zarinpal was verifying: the money is taken, so keep the bank reference for the refund.
          db.prepare("UPDATE orders SET ref_id = ? WHERE id = ?").run(refId, order!.id);
          console.error(`Order ${order!.id} was paid (ref ${refId}) after it was cancelled; refund it`);
          error = "پرداخت انجام شد ولی مهلت سفارش تمام شده بود؛ مبلغ توسط فروشگاه بازگردانده می‌شود";
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "خطا در تأیید پرداخت";
      }
    }
  }
  redirect(`/account?order=${order!.id}&${error ? `error=${errorParam(error)}` : "paid=1"}`);
}
