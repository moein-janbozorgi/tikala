// Register-form rules besides the password (see passwordProblem). The form mirrors them in `pattern`.
// Each returns a Persian error, or null if the value is acceptable.

/** 2-50 letters and spaces; \p{L}/\p{M} cover Persian and Latin; the class also holds an invisible U+200C (Persian half-space). */
export function nameProblem(name: string) {
  if (!/^[\p{L}\p{M}‌ ]{2,50}$/u.test(name) || (name.match(/\p{L}/gu) ?? []).length < 2) {
    return "نام باید ۲ تا ۵۰ کاراکتر و فقط شامل حروف و فاصله باشد";
  }
  return null;
}

/** Persian (۰-۹) and Arabic (٠-٩) digits to 0-9, since phones and postal codes are often typed on a Persian keyboard. */
export const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** Iranian mobile as 09xxxxxxxxx, accepting Persian digits, spaces/dashes and a +98 / 0098 / 98 prefix; null if invalid. */
export function normalizePhone(raw: string) {
  const digits = toLatinDigits(raw).replace(/[\s-]/g, "").replace(/^(\+98|0098|98)(?=9\d{9}$)/, "0");
  return /^09\d{9}$/.test(digits) ? digits : null;
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

export function emailProblem(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return "ایمیل معتبر نیست (مثال: name@example.com)";
  return null;
}
