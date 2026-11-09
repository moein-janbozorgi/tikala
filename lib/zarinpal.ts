import { db } from "./db.ts";

// Without a merchant ID, dev runs against the sandbox. Production never falls back to it, so fake payments can't mark orders paid.
const merchant = process.env.ZARINPAL_MERCHANT_ID;
const sandbox = process.env.ZARINPAL_SANDBOX === "1" || (!merchant && process.env.NODE_ENV !== "production");
const host = sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
const merchantId = merchant ?? (sandbox ? "1344b5d4-0048-11e8-94db-005056a205be" : "");

/** Prices are stored in Toman; the gateway is charged in Rial. */
export const toRial = (toman: number) => toman * 10;

async function call(path: string, body: object) {
  if (!merchantId) throw new Error("درگاه پرداخت تنظیم نشده است");
  const res = await fetch(`${host}/pg/v4/payment/${path}.json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ merchant_id: merchantId, ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { code?: number; authority?: string; ref_id?: number }; errors?: { code?: number } };
  return { data: json.data ?? {}, errorCode: json.errors?.code };
}

/** Asks Zarinpal for a payment session for an awaiting_payment order and returns the URL to send the customer to. */
export async function startPayment(orderId: number, origin: string) {
  const order = (await db.prepare("SELECT id, total, phone FROM orders WHERE id = ? AND status = 'awaiting_payment'").get(orderId)) as
    | { id: number; total: number; phone: string }
    | undefined;
  if (!order) throw new Error("این سفارش در انتظار پرداخت نیست");

  const { data, errorCode } = await call("request", {
    amount: toRial(order.total),
    currency: "IRR",
    description: `سفارش شماره ${order.id}`,
    callback_url: `${process.env.SITE_URL ?? origin}/payment/callback`,
    metadata: { mobile: order.phone, order_id: String(order.id) },
  });
  if (data.code !== 100 || !data.authority) throw new Error(`خطا در اتصال به درگاه پرداخت (کد ${errorCode ?? data.code ?? "نامشخص"})`);
  // A retry gets a new authority; the old one stops matching, so its callback is ignored.
  await db.prepare("UPDATE orders SET authority = ? WHERE id = ?").run(data.authority, order.id);
  return `${host}/pg/StartPay/${data.authority}`;
}

/** Confirms the payment with Zarinpal. Returns the bank reference id, or throws if the money wasn't taken. */
export async function verifyPayment(authority: string, amountRial: number) {
  const { data, errorCode } = await call("verify", { authority, amount: amountRial });
  // 100 = verified now, 101 = already verified by an earlier callback.
  if (data.code === 100 || data.code === 101) return String(data.ref_id ?? "");
  throw new Error(`پرداخت تأیید نشد (کد ${errorCode ?? data.code ?? "نامشخص"})`);
}

/**
 * Handles Zarinpal's return (?Authority=...&Status=OK|NOK). Nothing in the URL is trusted: the order is found by
 * authority and the amount comes from the database. Only orders still awaiting payment are verified; an unverified
 * payment is refunded by Zarinpal automatically. `notify` says which SMS the caller should send.
 */
export async function confirmPayment(authority: string, status: string | null): Promise<{ orderId?: number; error: string; notify?: "paid" | "late_payment" }> {
  const order = authority
    ? ((await db.prepare("SELECT id, total, status FROM orders WHERE authority = ?").get(authority)) as { id: number; total: number; status: string } | undefined)
    : undefined;
  if (!order) return { error: "تراکنش پیدا نشد" };
  if (order.status === "cancelled") return { orderId: order.id, error: "این سفارش لغو شده است" };
  if (order.status !== "awaiting_payment") return { orderId: order.id, error: "" }; // already paid: a repeated callback
  if (status !== "OK") return { orderId: order.id, error: "پرداخت انجام نشد. می‌توانید دوباره تلاش کنید." };
  let refId: string;
  try {
    refId = await verifyPayment(authority, toRial(order.total));
  } catch (e) {
    return { orderId: order.id, error: e instanceof Error ? e.message : "خطا در تأیید پرداخت" };
  }
  const paid = await db.prepare("UPDATE orders SET status = 'pending', ref_id = ? WHERE id = ? AND status = 'awaiting_payment'").run(refId, order.id);
  if (paid.changes) return { orderId: order.id, error: "", notify: "paid" };
  // Expired (cancelled) while Zarinpal was verifying: the money is taken, so keep the bank reference for the refund.
  await db.prepare("UPDATE orders SET ref_id = ? WHERE id = ?").run(refId, order.id);
  console.error(`Order ${order.id} was paid (ref ${refId}) after it was cancelled; refund it`);
  return { orderId: order.id, error: "پرداخت انجام شد ولی مهلت سفارش تمام شده بود؛ مبلغ توسط فروشگاه بازگردانده می‌شود", notify: "late_payment" };
}
