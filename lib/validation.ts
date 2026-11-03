// Register-form rules besides the password (see passwordProblem). The form mirrors them in `pattern`.
// Each returns a Persian error, or null if the value is acceptable.

/** 2-50 letters and spaces; \p{L}/\p{M} cover Persian and Latin; the class also holds an invisible U+200C (Persian half-space). */
export function nameProblem(name: string) {
  if (!/^[\p{L}\p{M}‌ ]{2,50}$/u.test(name) || (name.match(/\p{L}/gu) ?? []).length < 2) {
    return "نام باید ۲ تا ۵۰ کاراکتر و فقط شامل حروف و فاصله باشد";
  }
  return null;
}

export function emailProblem(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return "ایمیل معتبر نیست (مثال: name@example.com)";
  return null;
}
