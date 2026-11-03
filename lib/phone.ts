/** Persian (۰-۹) and Arabic (٠-٩) digits to 0-9, since phones and postal codes are often typed on a Persian keyboard. */
export const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** Iranian mobile as 09xxxxxxxxx, accepting Persian digits, spaces/dashes and a +98 / 0098 / 98 prefix; null if invalid. */
export function normalizePhone(raw: string) {
  const digits = toLatinDigits(raw).replace(/[\s-]/g, "").replace(/^(\+98|0098|98)(?=9\d{9}$)/, "0");
  return /^09\d{9}$/.test(digits) ? digits : null;
}
