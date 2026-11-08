import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";

// One-time SMS login codes: 6 digits, valid 3 minutes, 3 tries each, one resend per minute, 5 sends per phone per hour,
// 10 sends per IP per hour (so nobody can run up the SMS bill by asking codes for thousands of numbers).
const VALID_FOR = 3 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_SENDS_PER_IP_PER_HOUR = 10;
const MAX_TRIES = 3;
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest();

type Row = { code_hash: string; sent_at: number; expires_at: number; attempts: number; window_start: number; sends: number };
const row = async (phone: string) => (await db.prepare("SELECT * FROM otp_codes WHERE phone = ?").get(phone)) as Row | undefined;

/** Seconds until the phone may get a new code; 0 when it can now. */
export async function resendWait(phone: string, now = Date.now()) {
  const prev = await row(phone);
  return prev ? Math.max(0, Math.ceil((RESEND_AFTER - (now - prev.sent_at)) / 1000)) : 0;
}

/** Makes a new code for the phone and returns it. Throws a Persian message when the phone must wait. */
export async function createCode(phone: string, now = Date.now()) {
  const prev = await row(phone);
  const wait = await resendWait(phone, now);
  if (wait) throw new Error(`برای دریافت کد جدید ${wait.toLocaleString("fa-IR")} ثانیه صبر کنید`);
  const sameHour = prev && now - prev.window_start < HOUR;
  if (sameHour && prev.sends >= MAX_SENDS_PER_HOUR) throw new Error("تعداد درخواست کد بیش از حد مجاز است؛ یک ساعت دیگر تلاش کنید");

  const code = String(randomInt(100000, 1000000));
  await db.prepare(
    `INSERT INTO otp_codes (phone, code_hash, sent_at, expires_at, attempts, window_start, sends) VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (phone) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at,
       attempts = 0, window_start = excluded.window_start, sends = excluded.sends`,
  ).run(phone, hash(phone, code).toString("hex"), now, now + VALID_FOR, sameHour ? prev.window_start : now, sameHour ? prev.sends + 1 : 1);
  return code;
}

/**
 * Checks a code without using it up, so a form can still be fixed (e.g. a missing name) before consumeCode().
 * Every check counts as a try. Returns a Persian error, or null if the code is right.
 */
export async function checkCode(phone: string, code: string, now = Date.now()) {
  const saved = await row(phone);
  if (!saved || saved.expires_at < now || saved.attempts >= MAX_TRIES) return "کد منقضی شده است؛ کد جدید بگیرید";
  await db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
  return timingSafeEqual(hash(phone, code), Buffer.from(saved.code_hash, "hex")) ? null : "کد وارد شده اشتباه است";
}

/** Records a code request from this IP; false once it has asked for 10 in the last hour. Kept in the database, so a restart doesn't reset it. */
export async function smsAllowedForIp(ip: string, now = Date.now()) {
  await db.prepare("DELETE FROM sms_ip_sends WHERE at <= ?").run(now - HOUR);
  const { n } = (await db.prepare("SELECT COUNT(*) AS n FROM sms_ip_sends WHERE ip = ? AND at > ?").get(ip, now - HOUR)) as { n: number };
  if (n >= MAX_SENDS_PER_IP_PER_HOUR) return false;
  await db.prepare("INSERT INTO sms_ip_sends (ip, at) VALUES (?, ?)").run(ip, now);
  return true;
}

/** Code accepted and acted on: delete it so it can't be used again. */
export async function consumeCode(phone: string) {
  await db.prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
}
