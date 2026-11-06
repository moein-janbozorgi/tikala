import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ADMIN_PHONE } from "./auth";
import { db } from "./db";
import { toman } from "./format";

// Kavenegar (kavenegar.com). Settings:
//   KAVENEGAR_API_KEY        API key from the Kavenegar panel
//   KAVENEGAR_OTP_TEMPLATE   name of the "verify lookup" template for login codes (its text must contain %token)
//   KAVENEGAR_SENDER         optional line number for order messages; Kavenegar's default line is used without it
// Without an API key, messages go to the console and to <data folder>/sms-outbox.log instead: always in development,
// and in production only with SMS_CONSOLE=1 (for tests), so a live shop never pretends to send codes.
const key = process.env.KAVENEGAR_API_KEY;
const consoleMode = !key && (process.env.NODE_ENV !== "production" || process.env.SMS_CONSOLE === "1");
const OUTBOX = join(dirname(process.env.DB_PATH ?? "data/shop.db"), "sms-outbox.log");

async function kavenegar(method: string, params: Record<string, string>) {
  const res = await fetch(`https://api.kavenegar.com/v1/${key}/${method}.json`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json().catch(() => ({}))) as { return?: { status?: number; message?: string } };
  if (json.return?.status !== 200) throw new Error(`Kavenegar ${method} failed: ${json.return?.status ?? res.status} ${json.return?.message ?? ""}`);
}

function toOutbox(phone: string, message: string) {
  console.log(`[SMS to ${phone}] ${message}`);
  appendFileSync(OUTBOX, `${new Date().toISOString()}\t${phone}\t${message}\n`);
}

/**
 * Sends a login code through the verify template. Throws a Persian message if SMS isn't set up.
 * Returns true when the code only went to the outbox (no real SMS), so the site may show it on screen instead.
 */
export async function sendLoginCode(phone: string, code: string) {
  if (consoleMode) {
    toOutbox(phone, `کد ورود تیکلا: ${code}`);
    return true;
  }
  if (!key) throw new Error("سرویس پیامک تنظیم نشده است");
  try {
    await kavenegar("verify/lookup", { receptor: phone, token: code, template: process.env.KAVENEGAR_OTP_TEMPLATE ?? "verify" });
  } catch (e) {
    console.error(e);
    throw new Error("ارسال پیامک ناموفق بود؛ کمی بعد دوباره تلاش کنید");
  }
  return false;
}

/** Order update by SMS. Best effort: a failed message is logged and never breaks the order. */
export async function notifyOrder(orderId: number, event: "placed" | "paid" | "shipped") {
  const order = db.prepare("SELECT id, phone, total, ref_id, tracking_code FROM orders WHERE id = ?").get(orderId) as
    | { id: number; phone: string; total: number; ref_id: string | null; tracking_code: string }
    | undefined;
  if (!order) return;
  const n = order.id.toLocaleString("fa-IR");
  const text = {
    placed: `سفارش ${n} ثبت شد. مبلغ: ${toman(order.total)}، پرداخت هنگام تحویل.`,
    paid: `پرداخت سفارش ${n} انجام شد. کد پیگیری: ${order.ref_id ?? "-"}`,
    shipped: order.tracking_code
      ? `سفارش ${n} ارسال شد. کد رهگیری مرسوله: ${order.tracking_code}. از خرید شما سپاسگزاریم.`
      : `سفارش ${n} ارسال شد. از خرید شما سپاسگزاریم.`,
  }[event];
  await send(order.phone, `تیکلا: ${text}`, orderId);
  // The shop owner hears about every new order (cash on delivery when placed, online once paid) without opening /admin.
  if (event !== "shipped") await send(ADMIN_PHONE, `تیکلا: سفارش جدید ${n} به مبلغ ${toman(order.total)} (${event === "paid" ? "پرداخت آنلاین" : "پرداخت هنگام تحویل"})`, orderId);
}

/** One order message. Best effort: a failure is logged, and never stops the next message. */
async function send(phone: string, message: string, orderId: number) {
  try {
    if (consoleMode) return toOutbox(phone, message);
    if (!key) return; // production without SMS configured: nothing to send
    const sender = process.env.KAVENEGAR_SENDER;
    await kavenegar("sms/send", { receptor: phone, message, ...(sender ? { sender } : {}) });
  } catch (e) {
    console.error(`SMS for order ${orderId} to ${phone} failed`, e);
  }
}
