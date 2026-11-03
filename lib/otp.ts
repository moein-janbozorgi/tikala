import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";

// One-time SMS login codes: 6 digits, valid 3 minutes, 3 tries each, one resend per minute, 5 sends per phone per hour.
const VALID_FOR = 3 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_TRIES = 3;
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest();

type Row = { code_hash: string; sent_at: number; expires_at: number; attempts: number; window_start: number; sends: number };
const row = (phone: string) => db.prepare("SELECT * FROM otp_codes WHERE phone = ?").get(phone) as Row | undefined;

/** Makes a new code for the phone and returns it. Throws a Persian message when the phone must wait. */
export function createCode(phone: string, now = Date.now()) {
  const prev = row(phone);
  if (prev && now - prev.sent_at < RESEND_AFTER) {
    throw new Error(`برای دریافت کد جدید ${Math.ceil((RESEND_AFTER - (now - prev.sent_at)) / 1000).toLocaleString("fa-IR")} ثانیه صبر کنید`);
  }
  const sameHour = prev && now - prev.window_start < HOUR;
  if (sameHour && prev.sends >= MAX_SENDS_PER_HOUR) throw new Error("تعداد درخواست کد بیش از حد مجاز است؛ یک ساعت دیگر تلاش کنید");

  const code = String(randomInt(100000, 1000000));
  db.prepare(
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
export function checkCode(phone: string, code: string, now = Date.now()) {
  const saved = row(phone);
  if (!saved || saved.expires_at < now || saved.attempts >= MAX_TRIES) return "کد منقضی شده است؛ کد جدید بگیرید";
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
  return timingSafeEqual(hash(phone, code), Buffer.from(saved.code_hash, "hex")) ? null : "کد وارد شده اشتباه است";
}

/** Code accepted and acted on: delete it so it can't be used again. */
export function consumeCode(phone: string) {
  db.prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
}
