import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { toLatinDigits } from "./phone.ts";

// In their own file so client forms can use them without pulling in node:crypto.
export { normalizePhone, toLatinDigits } from "./phone.ts";

// Register-form rules besides the password (see passwordProblem). The form mirrors them in `pattern`.
// Each returns a Persian error, or null if the value is acceptable.

/** 2-50 letters and spaces; \p{L}/\p{M} cover Persian and Latin; the class also holds an invisible U+200C (Persian half-space). */
export function nameProblem(name: string) {
  if (!/^[\p{L}\p{M}‌ ]{2,50}$/u.test(name) || (name.match(/\p{L}/gu) ?? []).length < 2) {
    return "نام باید ۲ تا ۵۰ کاراکتر و فقط شامل حروف و فاصله باشد";
  }
  return null;
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
// shortcut: the key is random per server process (on globalThis so every bundle shares it), so a restart drops the
// banner on old error links and several servers wouldn't share it; read it from an env secret if the shop ever scales out.
const g = globalThis as { errorKey?: Buffer };
const errorKey = (g.errorKey ??= randomBytes(32));
const SIG_LENGTH = 22; // base64url characters, ~128 bits
const sign = (message: string) => createHmac("sha256", errorKey).update(message).digest("base64url").slice(0, SIG_LENGTH);

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

export function emailProblem(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return "ایمیل معتبر نیست (مثال: name@example.com)";
  return null;
}
