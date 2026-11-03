# Clothing shop (فروشگاه پوشاک)

A Persian (RTL) clothing store built with Next.js and Node's built-in SQLite. It has no external database or services.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

The database is created at `data/shop.db` on first start, with 4 sample products. Back up this file: it holds all your users and orders.

## Become admin

1. Register on the site.
2. `npm run make-admin -- you@example.com`
3. Reload the page. A «مدیریت» link appears in the header.

The admin panel manages products (sizes, colors, and stock per variant) and order status.

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

## Other commands

### End-to-end test

`tests/e2e.mjs` drives the real site: registering, cart, checkout, Zarinpal sandbox payments, admin, theme and login lockout. It creates test users and orders, so it refuses to run against `data/shop.db`. Use a throwaway database:

```bash
npm run build
# terminal 1 (PowerShell):
$env:DB_PATH="tmp/e2e.db"; $env:ZARINPAL_SANDBOX="1"; npx next start -p 3123
# terminal 2:
$env:DB_PATH="tmp/e2e.db"; npm run test:e2e
```

Delete `tmp/e2e.db` (and its `-wal`/`-shm` files) before each run, because the test expects fresh sample stock.

```bash
npm test             # checkout/stock/password tests
npm run build && npm start   # production
```

Requires Node 22.13 or newer, for `node:sqlite`. Hosting needs a persistent disk (a VPS, Liara, or Docker with a volume). Serverless platforms like Vercel lose the SQLite file.
