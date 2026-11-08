import { db } from "./db";

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
