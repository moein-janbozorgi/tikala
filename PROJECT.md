# Project map (for agents)

Read this before changing code. Human setup and operations are in [README.md](README.md); the engineering rules every change follows are in [GUIDELINES.md](GUIDELINES.md). **Next.js here is 16.4.4 and differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code** (see [AGENTS.md](AGENTS.md); that file is rewritten by `next dev`, so don't edit it).

## What it is

Tikla (بوتیک تیکلا), a Persian, right-to-left clothing shop. One Next.js app with no external database or ORM:

- Next.js 16.4.4 (App Router, server actions), React 19.3, Tailwind 4 (via `@tailwindcss/turbopack`), TypeScript
- SQLite through `@libsql/client` (async): a local file (`DB_PATH`) in development, tests and Docker; **Turso** when `TURSO_DATABASE_URL` is set (Vercel)
- `sharp` to convert uploaded photos to WebP; `@vercel/blob` stores them when `BLOB_READ_WRITE_TOKEN` is set (Vercel), else `data/uploads`
- Outside services: Zarinpal (payments) and Kavenegar (SMS), both called with `fetch` and no SDK

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000. Creates `data/shop.db` with sample products on first run |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm test` | `node --test tests/shop.test.ts` (unit tests for checkout, stock and passwords) |
| `npm run test:e2e` | `tests/e2e.mjs` against a running server. It needs a throwaway `DB_PATH` and refuses `data/shop.db`. Setup is in the README |

CI: [.github/workflows/test.yml](.github/workflows/test.yml) runs the unit tests, a build and the e2e test.

## Layout

```
app/
  layout.tsx            root layout (RTL, theme, header); globals.css
  (home)/page.tsx       product list: search, filters, price range, sort, "load more"
  product/[id]/         product page (gallery, color/size pickers); get-product.ts loads it
  cart/                 cart + checkout form (address-fields.tsx)
  account/              user's orders, profile, phone/password
  about/                static page
  @auth/                parallel-route login/register/SMS-code modal (opened by ?auth=login)
  [...path]/            catch-all 404
  admin/                admin panel (orders = page.tsx, products, categories, coupons, reports,
                        orders/[id]/invoice, export route); actions.ts = admin server actions
  api/products          JSON product list (for "load more")
  api/suggest           search-box suggestions
  payment/callback      Zarinpal return URL: verifies the payment
  uploads/[name]        serves uploaded photos from data/uploads
  actions.ts            shop server actions
  *.tsx (flat)          shared components: product-card, combobox, search-input, side-menu,
                        validated-form, submit-button, qty-stepper, price-range, offline-screen…
lib/                    server-side logic (below)
tests/                  shop.test.ts (node:test), e2e.mjs
instrumentation.ts      onRequestError → lib/error-log.ts
next.config.ts          standalone output when STANDALONE=1, 5 MB server-action body, security headers, cache headers
scripts/move-uploads.mjs one-off: copies data/uploads photos to Vercel Blob and rewrites their paths in Turso
scripts/export-for-turso.mjs one-off: read-only snapshot of data/shop.db (WAL included) as data/turso-import.db for the Turso import
Dockerfile              two-stage standalone image, data volume at /app/data
public/                 fonts, sample product photos (/products)
```

### Server actions

- [app/actions.ts](app/actions.ts): `addToCart`, `updateCartItem`, `checkout`, `applyCoupon`, `cancelMyOrder`, `payOrder`, `register`, `login`, `requestCode`, `verifyCode`, `setPassword`, `setTheme`, `logout`
- [app/admin/actions.ts](app/admin/actions.ts): `saveProduct`, `deleteProduct`, `addCategory`, `renameCategory`, `setSizeGuide`, `deleteCategory`, `setOrderStatus`, `deleteOrder`, `addCoupon`, `toggleCoupon`, `deleteCoupon`. Each one calls `requireAdmin()` first

### lib/

| File | Purpose |
|---|---|
| `db.ts` | Opens libSQL (Turso or a file), defines the schema and migrations, seeds samples. `db.prepare(sql).get/all/run` (async), `transaction`, `placeOrder`, `cancelOrder`, `purgeOrder`, `expireUnpaidOrders`, `couponDiscount`, `orderTotal`, `parseVariants`/`variantsProblem`/`saveVariants`, `countSearch`/`popularSearches`, SQL fragments `TEHRAN`, `SOLD` |
| `auth.ts` | Sessions (random token in a cookie, only its sha256 stored), `getUser` (React `cache`), `requireUser`, `requireAdmin`, `ADMIN_PHONE` |
| `cart.ts` | Cart = `{variantId: qty}` in an httpOnly cookie (guests can shop); coupon cookie; `getCartLines` |
| `products.ts` | `listProducts` (search, filters, sort, pagination), `PAGE_SIZE`, `SORTS` |
| `otp.ts` | SMS login codes: create, check, consume, resend wait, per-IP limit |
| `sms.ts` | Kavenegar: `sendLoginCode`, `notifyOrder` (best effort, never breaks an order) |
| `zarinpal.ts` | `startPayment`, `verifyPayment`, `confirmPayment` (the callback's logic: tested in `shop.test.ts`), `toRial` |
| `password.ts` | Hash/verify, `passwordProblem`, login lockout (stored in the DB) |
| `validation.ts` | `nameProblem`, `emailProblem`, `productProblem`, `couponProblem`, `normalizePostalCode`, `normalizeCoupon`, `safeNext`, signed `?error=` params (`errorParam`/`readErrorParam`), `likeContains` |
| `rules.ts` | Regex patterns shared by the forms' `pattern` attribute and the server checks |
| `phone.ts` | `toLatinDigits`, `toPersianDigits`, `normalizePhone` |
| `format.ts` | `toman()`, shipping cost, `ORDER_STATUSES`, `PROVINCES`, `SITE_URL`, `date()` |
| `flash.ts` | Keeps form values across a redirect after a failed submit |
| `uploads.ts` | Checks the image type from its bytes, converts to WebP (at most 1200×1500), saves to Vercel Blob (returns its URL) or `data/uploads` |
| `error-log.ts` | `console.error` on Vercel, else appends to `data/errors.log` |
| `csv.ts`, `cities.ts`, `samples.ts` | CSV export, province→city list, sample products and size guides |

## Data model (lib/db.ts)

Tables: `users` (phone and/or email; `password_hash` may be NULL), `sessions`, `products` (`category`, `subcategory`, `price`, `compare_price`, `image`, `active`), `variants` (size × color × stock, `CHECK stock >= 0`), `product_images` (gallery, with an optional `color`), `categories` (`name`, `size_guide`), `orders` (status, payment `cod|online`, Zarinpal `authority`/`ref_id`, address fields, `coupon`, `discount`, `tracking_code`), `order_items` (copies name/size/color/price so past orders survive product edits), `coupons`, `otp_codes`, `login_failures`, `sms_ip_sends`, `settings`, `search_counts`.

**Queries:** `await db.prepare(sql).get(...args)` (also `.all`, `.run` → `{ changes }`), with `?` parameters; rows come back as plain objects, cast with `as`. Every function that queries is `async`, and every call must be awaited (`tsc` misses an unawaited `.run()`). `transaction(async () => …)` opens a write transaction (`BEGIN IMMEDIATE`); statements inside it, including in called functions, use it automatically (AsyncLocalStorage), and nested `transaction()` calls join it. Transactions run one at a time per server instance (a queue in `db.ts`), so concurrent checkouts wait instead of failing with SQLITE_BUSY.

**Migrations:** `migrate()` in `db.ts` runs on first import: the base `CREATE TABLE IF NOT EXISTS`, then `step(N, …)` blocks guarded by `PRAGMA user_version` (currently **12**). To change the schema, append `await step(13, () => exec(...))` at the end of `migrate()`. Never edit an old step. Build workers and server instances may run them at once, so each step runs in its own transaction and re-checks the version. Queries wait for `migrate()` to finish.

Order statuses are in `ORDER_STATUSES` (`lib/format.ts`): `awaiting_payment`, `pending`, `processing`, `shipped`, `delivered`, `cancelled`.

## Key flows

- **Checkout:** `checkout` action → `placeOrder` re-checks stock, the coupon and active products inside one `BEGIN IMMEDIATE` transaction and decrements stock. Cash on delivery starts as `pending`. Online starts as `awaiting_payment`, keeps its stock reserved, then goes to Zarinpal → `/payment/callback` → `confirmPayment` → `verifyPayment`. Money that arrives for an order already expired keeps its `ref_id` and texts the owner to refund it.
- **Unpaid expiry:** `expireUnpaidOrders()` cancels online orders unpaid for 30 minutes. It runs whenever orders are read or placed; there is no cron.
- **Cancel:** `cancelOrder` returns the stock and the coupon use, once (cancelling is final).
- **Money:** integer **Toman** everywhere; Rial (×10) only at the Zarinpal call. Shipping is 85,000, free from 5,000,000 of goods after the discount.
- **Login:** phone + 6-digit SMS code (main), or email + password. Without `KAVENEGAR_API_KEY` in dev, codes go to the console and `data/sms-outbox.log`.
- **Admin:** an account is admin when its phone equals `ADMIN_PHONE` (computed in the `getUser` query, not the `is_admin` column).
- **Errors to the user:** actions redirect with a signed `?error=` (`errorParam`) shown by `app/error-message.tsx`; form values survive with `setFlash`/`getFlash`.

## Conventions

- All user-facing text is Persian. Validation helpers return a Persian message or `null`; domain functions `throw new Error("<Persian>")`.
- Run user-typed numbers through `toLatinDigits` (people type Persian digits).
- Every rule exists twice: an HTML `pattern`/attribute on the form (from `lib/rules.ts`) and a server check (`lib/validation.ts`). Keep them in sync.
- Use plain SQL with `db.prepare(...)` and `?` parameters; `likeContains` + `ESCAPE '\'` for search.
- Comments explain *why*; keep that style. Don't add dependencies for small things.
- Times: SQLite `CURRENT_TIMESTAMP` (UTC). Reports shift by `TEHRAN` (+3:30, no DST).

## Environment variables

| Variable | Default / meaning |
|---|---|
| `DB_PATH` | `data/shop.db`. Uploads and logs go in the same folder. Ignored when `TURSO_DATABASE_URL` is set |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Use Turso instead of the local file (Vercel) |
| `BLOB_READ_WRITE_TOKEN` | Store photos in Vercel Blob instead of `data/uploads` |
| `ADMIN_PHONE` | `09370952694` |
| `SITE_URL` | `http://localhost:3000`; required in production (payment callback, sitemap, previews) |
| `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=1` | Payment gateway; the sandbox is automatic in dev |
| `KAVENEGAR_API_KEY`, `KAVENEGAR_OTP_TEMPLATE`, `KAVENEGAR_SENDER` | SMS |
| `SMS_CONSOLE=1` | Force console SMS (e2e) |
| `STANDALONE=1` | Standalone build output (Docker) |

## Gotchas

- Two ways to run: own server/Docker (everything in `data/`: the DB + `-wal`/`-shm`, `uploads/`, `errors.log`, `sms-outbox.log`; gitignored, never commit or delete it) or Vercel (Turso + Vercel Blob, no disk writes). Code must work in both: don't add new files under `data/` without a Vercel alternative.
- `next build` imports `lib/db.ts`, which creates and seeds a database. The Dockerfile builds with `DB_PATH=/tmp/build.db`; on Vercel the build talks to Turso.
- `lib/validation.ts` loads its signing key with a top-level `await` (so `errorParam` stays synchronous for `redirect()` callers).
- Vercel refuses requests over 4.5 MB, so the product form shrinks photos in the browser (`app/validated-form.tsx`) and caps a save at 4 MB.
- The rate limits key on the client IP from `X-Forwarded-For`, so the proxy/CDN must pass the real IP (README → CDN).
- Pages are per-user (cart, session cookies), so they are `no-store`; only static files and `/uploads` are cached.
