# Tikala clothing shop (بوتیک تیکالا)

A Persian (RTL) clothing store built with Next.js and Node's built-in SQLite. It has no external database or services.

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
| `SITE_URL` | Public address, e.g. `https://myshop.ir`. Zarinpal sends customers back to `SITE_URL/payment/callback`. Required behind a proxy. |

- With `npm run dev` and no merchant ID, the sandbox is used automatically.
- In production, online payment is refused until `ZARINPAL_MERCHANT_ID` is set (or `ZARINPAL_SANDBOX=1`). Cash on delivery still works.
- Unpaid orders show «در انتظار پرداخت» with a retry button for the customer. Cancelling an order in the admin panel returns its stock.

## SMS (Kavenegar)

Customers sign in with a mobile number and a 5-digit SMS code (email and password still work). They also get an SMS when an order is placed (cash on delivery), paid online, or marked shipped.

| Variable | Meaning |
|---|---|
| `KAVENEGAR_API_KEY` | API key from the Kavenegar panel |
| `KAVENEGAR_OTP_TEMPLATE` | Name of your "verify lookup" template for login codes. Its text must contain `%token`, for example: «کد ورود تیکالا: %token» |
| `KAVENEGAR_SENDER` | Optional line number for order messages (Kavenegar's default line otherwise) |

- Without an API key in development, messages are printed in the server console and saved to `data/sms-outbox.log`, so you can test logins.
- In production without a key, phone login shows «سرویس پیامک تنظیم نشده است» and no order messages are sent. `SMS_CONSOLE=1` forces console mode (used by the e2e test).
- Code rules: valid 3 minutes, 5 tries, one resend per minute, at most 5 codes per number per hour.
- **Forgot password:** add a mobile number in the account page, then sign in with a code and set a new password there.

## Product photos

In the admin panel, upload a JPG, PNG or WEBP (up to 5 MB), or paste an image URL. Uploads are saved in `data/uploads`, so **back up the whole `data/` folder**, not just the database.

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

Requires Node 22.13 or newer, for `node:sqlite`. Hosting needs a persistent disk (a VPS, Liara, or Docker with a volume). Serverless platforms like Vercel lose the SQLite file.
