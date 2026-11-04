// Form rules as HTML `pattern` + the message shown when it fails, mirroring the server checks in lib/validation.ts.
// Plain strings in their own file, so server and client components can both import them.

/** A person's name (account or checkout recipient): 3-15 letters; spaces, half-spaces (‌) and diacritics between them don't count. */
export const NAME_PATTERN = "\\s*(?:[\\p{M}\\u200c ]*\\p{L}){3,15}[\\p{M}\\u200c ]*\\s*";
export const NAME_RULE = "۳ تا ۱۵ حرف، فقط حروف و فاصله";

/**
 * Email: the common user@domain.tld form. Dots only between characters, domain labels don't start or end with "-",
 * and the ending is 2-6 letters (so made-up ones like ".commmef" fail). Characters the `v` regex flag reserves are escaped.
 */
export const EMAIL_PATTERN = String.raw`[A-Za-z0-9_%+\-]+(\.[A-Za-z0-9_%+\-]+)*@([A-Za-z0-9]([A-Za-z0-9\-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,6}`;

/** A product image URL, as productProblem() checks it: http(s), or a path on this site (not "//host"). */
export const IMAGE_PATTERN = String.raw`https?:\/\/[^\s\/]+\S*|\/([^\/\\]\S*)?`;
