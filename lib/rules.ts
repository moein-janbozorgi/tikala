// Form rules as HTML `pattern` + the message shown when it fails, mirroring the server checks in lib/validation.ts.
// Plain strings in their own file, so server and client components can both import them.

/** A person's name, as nameProblem() checks it. ‌ is the Persian half-space. */
export const NAME_PATTERN = "\\s*[\\p{L}\\p{M}\\u200c ]{2,50}\\s*";
export const NAME_RULE = "۲ تا ۵۰ کاراکتر، فقط حروف و فاصله";

/** A product image URL, as productProblem() checks it: http(s), or a path on this site (not "//host"). */
export const IMAGE_PATTERN = String.raw`https?:\/\/[^\s\/]+\S*|\/([^\/\\]\S*)?`;
