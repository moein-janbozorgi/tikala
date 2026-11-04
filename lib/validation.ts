import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";
import { toLatinDigits } from "./phone.ts";
import { EMAIL_PATTERN, NAME_PATTERN } from "./rules.ts";

// In their own file so client forms can use them without pulling in node:crypto.
export { normalizePhone, toLatinDigits } from "./phone.ts";

// Register-form rules besides the password (see passwordProblem). The form mirrors them in `pattern`.
// Each returns a Persian error, or null if the value is acceptable.

const NAME = new RegExp(`^(?:${NAME_PATTERN})$`, "v");
/** A person's name (account or checkout recipient): 3-15 letters, spaces not counted. Same regex as the forms' `pattern`. */
export function nameProblem(name: string) {
  return name.length <= 30 && NAME.test(name) ? null : "نام باید ۳ تا ۱۵ حرف باشد و فقط شامل حروف و فاصله";
}


/** Postal code as 10 digits (Persian digits and dashes accepted); null if invalid. */
export function normalizePostalCode(raw: string) {
  const digits = toLatinDigits(raw).replace(/[\s-]/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * Only same-site paths, so ?next= can't send users to another site. Resolved the way a browser would, so tricks like
 * "/\evil.com" or "/<tab>/evil.com" (both read as "//evil.com") can't leave the site either.
 */
export function safeNext(next: unknown) {
  const url = typeof next === "string" ? URL.parse(next, "http://x") : null;
  return url?.origin === "http://x" ? url.pathname + url.search + url.hash : "/";
}

// Error messages travel in the URL (?error=) so they survive redirects. They're signed, so nobody can send a link that
// makes the shop show their own text ("your account is blocked, call…") in an official-looking alert.
// The key is made once and kept in the database, so error links still work after a restart (and every process agrees).
let errorKey: Buffer | undefined;
function key() {
  if (!errorKey) {
    db.prepare("INSERT OR IGNORE INTO settings (name, value) VALUES ('error_key', ?)").run(randomBytes(32).toString("hex"));
    errorKey = Buffer.from((db.prepare("SELECT value FROM settings WHERE name = 'error_key'").get() as { value: string }).value, "hex");
  }
  return errorKey;
}
const SIG_LENGTH = 22; // base64url characters, ~128 bits
const sign = (message: string) => createHmac("sha256", key()).update(message).digest("base64url").slice(0, SIG_LENGTH);

/** URL-encoded value for ?error= that ErrorMessage will show. */
export const errorParam = (message: string) => encodeURIComponent(`${sign(message)}.${message}`);

/** The message inside a ?error= value, or null if errorParam didn't make it (a forged or edited link). */
export function readErrorParam(value: unknown) {
  if (typeof value !== "string" || value[SIG_LENGTH] !== ".") return null;
  const message = value.slice(SIG_LENGTH + 1);
  const given = Buffer.from(value.slice(0, SIG_LENGTH));
  const expected = Buffer.from(sign(message));
  return given.length === expected.length && timingSafeEqual(given, expected) ? message : null;
}

/** SQL LIKE pattern for "contains q", with the user's own % and _ taken literally. Use with ESCAPE '\'. */
export const likeContains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// Toman. Keeps order totals (sent to Zarinpal in rial, ×10) far inside safe integer range.
export const MAX_PRICE = 1_000_000_000;

/** Admin product form rules (the form mirrors them). Returns a Persian error, or null if acceptable. */
export function productProblem(p: { name: string; price: number; compare_price?: number; description: string; subcategory: string; image: string }) {
  if (p.name.length < 2 || p.name.length > 100) return "نام محصول باید ۲ تا ۱۰۰ کاراکتر باشد";
  if (!Number.isInteger(p.price) || p.price < 1000 || p.price > MAX_PRICE) return "قیمت باید عدد صحیح بین ۱٬۰۰۰ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد";
  // 0 = not on sale; otherwise it must be a real, higher "before" price, or the % badge would be nonsense.
  if (p.compare_price && (!Number.isInteger(p.compare_price) || p.compare_price <= p.price || p.compare_price > MAX_PRICE)) {
    return "قیمت قبل از تخفیف باید عدد صحیحی بیشتر از قیمت فعلی باشد";
  }
  if (p.description.length > 2000) return "توضیحات حداکثر ۲۰۰۰ کاراکتر است";
  if (p.subcategory && (p.subcategory.length < 2 || p.subcategory.length > 40)) return "نوع (زیردسته) باید ۲ تا ۴۰ کاراکتر باشد";
  // http(s) URL or a path on this site; "//host" would load from another site.
  if (p.image && (p.image.length > 500 || !/^(https?:\/\/[^\s/]+\S*|\/(?![/\\])\S*)$/.test(p.image))) return "آدرس تصویر معتبر نیست";
  return null;
}

const EMAIL = new RegExp(`^(?:${EMAIL_PATTERN})$`, "v"); // same regex as the register form's `pattern`
/** A discount code as typed: Latin capitals, digits and "-"; Persian digits and spaces are forgiven. */
export const normalizeCoupon = (code: unknown) => toLatinDigits(String(code ?? "")).replace(/\s/g, "").toUpperCase();

/** Admin's new discount code. Values are already numbers (NaN when not one). Returns a Persian error, or null. */
export function couponProblem(c: { code: string; percent: number; amount: number; min_total: number; max_uses: number | null; expires_on: string }) {
  if (!/^[A-Z0-9-]{3,20}$/.test(c.code)) return "کد تخفیف باید ۳ تا ۲۰ حرف انگلیسی، عدد یا «-» باشد";
  if (!!c.percent === !!c.amount) return "یکی از «درصد تخفیف» یا «مبلغ تخفیف» را وارد کنید";
  if (c.percent && (!Number.isInteger(c.percent) || c.percent < 1 || c.percent > 90)) return "درصد تخفیف باید عدد صحیح ۱ تا ۹۰ باشد";
  if (c.amount && (!Number.isInteger(c.amount) || c.amount < 1000 || c.amount > MAX_PRICE)) return "مبلغ تخفیف باید عدد صحیح از ۱٬۰۰۰ تومان به بالا باشد";
  if (!Number.isInteger(c.min_total) || c.min_total < 0 || c.min_total > MAX_PRICE) return "حداقل خرید معتبر نیست";
  if (c.max_uses !== null && (!Number.isInteger(c.max_uses) || c.max_uses < 1 || c.max_uses > 1_000_000)) return "تعداد دفعات استفاده باید عدد صحیح مثبت باشد";
  if (c.expires_on && (!/^\d{4}-\d{2}-\d{2}$/.test(c.expires_on) || Number.isNaN(Date.parse(c.expires_on)))) return "تاریخ انقضا معتبر نیست";
  return null;
}

export function emailProblem(email: string) {
  if (email.length > 254 || !EMAIL.test(email)) return "ایمیل معتبر نیست (مثال: name@example.com)";
  return null;
}
