# Tikla clothing shop (بوتیک تیکلا)

A Persian (RTL) clothing store built with Next.js and SQLite (through libSQL). It runs either on its own server with a local database file (development, Docker, a VPS) or on Vercel with a Turso database and Vercel Blob for photos (see **Deploy on Vercel**).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

The database is created at `data/shop.db` on first start, with 53 sample products in 7 categories. Back up the whole `data/` folder: it holds all your users, orders and uploaded photos.

## Admin access

Only the account with the mobile number **09370952694** can open the admin panel. Sign in with that number and its SMS code (or add the number to an email account in its account page), and a «مدیریت» link appears in the header.

- To use another number, set `ADMIN_PHONE=09xxxxxxxxx` in the server's environment and restart.
- The number must receive SMS codes, so in production Kavenegar must be set up (see below), or no one can reach the panel.
- Moving the admin number to another account (or removing it) moves admin access with it.

The admin panel (`/admin`) has three pages:

- **Orders:** today's sales, status tabs with counts, search by order number, customer name or phone, and status changes. Marking an order shipped texts the customer; cancelling returns its stock.
- **Products:** search and filter by category, add, edit (sizes, colors and stock per variant, photo upload, hide from the shop) and delete. Deleting can't be undone, but past orders keep their copy of the item.
- **Categories:** add, rename (every product in it follows) and delete empty ones. A product's type (for example کتانی or بوت) is typed in its form and appears under its category in the shop's side menu.

## Online payment (Zarinpal)

At checkout, customers choose online payment or cash on delivery. Online orders are charged in Rial (Toman price × 10). Their items stay reserved until the order is paid or cancelled.

| Variable | Meaning |
|---|---|
| `ZARINPAL_MERCHANT_ID` | Your 36-character merchant ID from the Zarinpal panel. Set it in production. |
| `ZARINPAL_SANDBOX=1` | Use Zarinpal's test gateway (no real money). |
| `SITE_URL` | Public address, e.g. `https://myshop.ir`. Zarinpal sends customers back to `SITE_URL/payment/callback`; `sitemap.xml`, `robots.txt` and link previews (product photo on Telegram/WhatsApp) use it for absolute links. Required in production. |

- With `npm run dev` and no merchant ID, the sandbox is used automatically.
- In production, online payment is refused until `ZARINPAL_MERCHANT_ID` is set (or `ZARINPAL_SANDBOX=1`). Cash on delivery still works.
- Unpaid orders show «در انتظار پرداخت» with a retry button for the customer. Cancelling an order in the admin panel returns its stock.

## SMS (Kavenegar)

Customers sign in with a mobile number and a 6-digit SMS code (email and password still work). They also get an SMS when an order is placed (cash on delivery), paid online, or marked shipped.

| Variable | Meaning |
|---|---|
| `KAVENEGAR_API_KEY` | API key from the Kavenegar panel |
| `KAVENEGAR_OTP_TEMPLATE` | Name of your "verify lookup" template for login codes. Its text must contain `%token`, for example: «کد ورود تیکلا: %token» |
| `KAVENEGAR_SENDER` | Optional line number for order messages (Kavenegar's default line otherwise) |

- Without an API key in development, messages are printed in the server console and saved to `data/sms-outbox.log`, so you can test logins.
- In production without a key, phone login shows «سرویس پیامک تنظیم نشده است» and no order messages are sent. `SMS_CONSOLE=1` forces console mode (used by the e2e test).
- Code rules: valid 3 minutes, 3 tries, one resend per minute, at most 5 codes per number and 10 per visitor IP per hour.
- The per-IP limit expects Nginx (or another proxy) in front, setting `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (or `$remote_addr`). Without a proxy, visitors can fake their IP.
- **Forgot password:** add a mobile number in the account page, then sign in with a code and set a new password there.
- The admin number (`ADMIN_PHONE`) also gets an SMS for every new order: cash-on-delivery orders when placed, online ones once paid.

## Product photos

In the admin panel, upload a JPG, PNG or WEBP (up to 5 MB each), or paste an image URL, plus up to 8 more photos for the product's gallery. The browser shrinks each photo before sending (one save carries at most 4 MB of photos, under Vercel's 4.5 MB limit), and the server stores it as a WebP of at most 1200×1500. With `BLOB_READ_WRITE_TOKEN` set (Vercel), photos go to Vercel Blob; otherwise they are saved in `data/uploads`, so on your own server **back up the whole `data/` folder**, not just the database.

## Backups

- **Vercel + Turso:** Turso keeps point-in-time restores of the database (how far back depends on your Turso plan); restore from the Turso dashboard or CLI. Photos in Vercel Blob are kept until deleted.
- **Own server / Docker:** copy the whole `data/` folder (database and photos) to another machine regularly, for example with a nightly cron job. Stop the server or use `sqlite3 data/shop.db ".backup copy.db"` for a consistent database copy.

## Error log

Server errors (pages, form actions, API routes) are logged one per line: time, method, path, kind, digest, message. The digest matches the one the browser console shows for the same error. On Vercel they appear in the project's **Logs** tab; elsewhere they are appended to `data/errors.log`, which isn't rotated, so add it to logrotate or empty it now and then.

## Docker

```bash
docker build -t tikla .
docker run -d -p 3000:3000 -v tikla-data:/app/data --env-file .env --name tikla tikla
```

`.env` holds the variables above (`SITE_URL`, `ZARINPAL_MERCHANT_ID`, `KAVENEGAR_API_KEY`, …). The image is a standalone build (`STANDALONE=1`, see `next.config.ts`), and everything that must survive an update lives in the `/app/data` volume. Keep Nginx in front for HTTPS and the real client IP, as described under SMS. Leave `TURSO_*` and `BLOB_READ_WRITE_TOKEN` unset here to keep the database and photos in the volume.

## CDN (ArvanCloud, Cloudflare…)

Pages show each visitor's own cart and account, so Next marks them `no-store` and a CDN passes them through. It only caches the files: `/_next/static` and `/uploads` (cached forever), `/fonts` (forever), `/products` (a week) and `/_next/image` (product photos resized and converted to WebP for each screen size, as long as the original).

- Leave query strings in the cache key and pass the `rsc` request header through. Next uses both to tell page data from HTML.
- **Real client IP:** behind a CDN, every request reaches Nginx from a CDN server. Unless Nginx restores the visitor's IP, the login lockout and the SMS limit count all visitors of one CDN server as one person and lock them all out. In Nginx:

```nginx
# one line per address range on your CDN's published list (203.0.113.0/24 is only a placeholder)
set_real_ip_from 203.0.113.0/24;
real_ip_header X-Forwarded-For;
real_ip_recursive on;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-For $remote_addr;  # now the visitor's IP
    proxy_set_header Host $host;
}
```

## Deploy on Vercel

Vercel's disk is thrown away between requests, so the database lives in **Turso** (hosted SQLite) and photos in **Vercel Blob**. Everything else is the same code.

> **Iran:** Vercel and Turso are US companies and their terms exclude Iran, so an account can be closed without notice. Zarinpal and Kavenegar may also refuse or slow down requests from servers outside Iran: test a sandbox payment and an SMS login on a preview deploy before going live. A server inside Iran (Docker, above) avoids both problems.

The move is done in two passes, so the live shop's data is never touched while testing: first a **preview** with its own copy of the data, then (only once the preview works) **production** from a fresh copy. The original `data/` folder is only ever read.

### A. Preview (testing)

1. **Back up and export.** Stop the local server. Copy the whole `data/` folder somewhere outside the project. Then
   `node scripts/export-for-turso.mjs`
   writes `data/turso-import.db`: one file with everything, including the latest changes still in `shop.db-wal`, in the format Turso needs. It opens `shop.db` read-only and checks the copy has the same tables, the same row counts, schema version 12 and no integrity errors.
2. **Preview database.** Install the [Turso CLI](https://docs.turso.tech/cli/introduction), then
   `turso db create tikla-preview --from-file data/turso-import.db`
   (create it in the region closest to Vercel's functions, US East by default, since each order makes several round trips).
   Check: `turso db shell tikla-preview "PRAGMA user_version"` prints `12`.
   `turso db show tikla-preview --url` gives `TURSO_DATABASE_URL`; `turso db tokens create tikla-preview --expiration none` gives `TURSO_AUTH_TOKEN`.
3. **Vercel project without a production deploy.** Importing the GitHub repository in the dashboard deploys `main` to production at once, so create the project from the command line instead: on the `vercel` branch, run `npx vercel link` (creates and links the project, deploys nothing).
4. **Preview Blob store.** Vercel dashboard → Storage → create a Blob store, connect it to the project for the **Preview** environment only. That adds `BLOB_READ_WRITE_TOKEN` to Preview.
5. **Preview environment variables** (Settings → Environment Variables, tick **Preview** only, or `npx vercel env add NAME preview`):

   | Variable | Preview value |
   |---|---|
   | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | `tikla-preview` from step 2 |
   | `BLOB_READ_WRITE_TOKEN` | added by step 4 |
   | `ZARINPAL_SANDBOX` | `1` (test gateway, no real money) |
   | `ADMIN_PHONE` | the admin's mobile number |
   | `KAVENEGAR_API_KEY`, `KAVENEGAR_OTP_TEMPLATE`, `KAVENEGAR_SENDER` | SMS, as above |
   | `SITE_URL` | leave unset: payments then return to the preview address itself |

6. **Move the photos into the preview.** Put the preview's three keys (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BLOB_READ_WRITE_TOKEN`) in a local `.env.vercel` file (git ignores it) and run
   `node --env-file=.env.vercel scripts/move-uploads.mjs`.
   Each photo in `data/uploads` is uploaded, read back and compared byte for byte, and only then is its path rewritten in the Turso database. It ends by printing how many `/uploads/` paths are left (should be 0) and is safe to run again. Local files are only read.
7. **Deploy the preview:** `npx vercel deploy` (a preview; never add `--prod`). Open the printed URL (only you can see it while Vercel's deployment protection is on) and test: browsing and search, product pages and photos, register and email login, SMS login, cart and discount code, cash-on-delivery order, online order through the Zarinpal sandbox, account page and cancelling, every admin page (orders, status and SMS, products with a photo upload from a phone, categories, coupons, reports, CSV export, invoice). Errors appear in the project's **Logs** tab.

### B. Production (only after the preview passes)

Stop the live server, make a new backup of `data/`, delete the old `data/turso-import.db` and export again (so orders placed since the preview are included), then repeat steps 2, 4, 5 and 6 with a new database (`tikla`), a Blob store and variables for the **Production** environment, with `SITE_URL` set to the shop's address and `ZARINPAL_MERCHANT_ID` instead of the sandbox. In the Zarinpal panel, register the shop's domain. Deploy with `npx vercel deploy --prod`, or connect the Git repository and merge `vercel` into `main`. Keep the `data/` backup until the new shop has run without problems for a while.

The client IP for the login and SMS limits comes from `X-Forwarded-For`, which Vercel sets itself, so no proxy setup is needed there.

## Automatic tests (GitHub Actions)

`.github/workflows/test.yml` runs the unit tests, a production build and the end-to-end test on every push and pull request. The end-to-end test needs Zarinpal's sandbox; if GitHub's servers can't reach it, that step fails even though the shop works.

## Other commands

### End-to-end test

`tests/e2e.mjs` drives the real site: registering, cart, checkout, Zarinpal sandbox payments, admin, theme and login lockout. It creates test users and orders, so it refuses to run against `data/shop.db`. Use a throwaway database:

```bash
npm run build
# terminal 1 (PowerShell):
$env:DB_PATH="tmp/e2e.db"; $env:ZARINPAL_SANDBOX="1"; $env:SMS_CONSOLE="1"; $env:ADMIN_PHONE="09350000009"; npx next start -p 3123
# terminal 2:
$env:DB_PATH="tmp/e2e.db"; npm run test:e2e
```

Delete `tmp/e2e.db` (and its `-wal`/`-shm` files) before each run, because the test expects fresh sample stock.

```bash
npm test             # checkout/stock/password tests
npm run build && npm start   # production
```

Requires Node 22.13 or newer. Self-hosting needs a persistent disk (a VPS, Liara, or Docker with a volume); serverless hosting needs Turso and Vercel Blob, as in **Deploy on Vercel**.
