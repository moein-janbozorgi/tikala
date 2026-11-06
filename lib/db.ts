import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { shippingCost, toman } from "./format.ts";
import { toLatinDigits } from "./phone.ts";
import { SAMPLE_PRODUCTS, SIZE_GUIDES } from "./samples.ts";

const path = process.env.DB_PATH ?? "data/shop.db";
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size, color)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- name/size/color/price are copied so past orders survive product edits
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
`);

export type Product = {
  id: number;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: number;
  /** Price before discount, in toman; 0 = not on sale. */
  compare_price: number;
  image: string;
  active: number;
};
export type Variant = { id: number; product_id: number; size: string; color: string; stock: number };

export function transaction<T>(fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Schema changes after the first release; user_version records which have run.
const schemaVersion = () => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
transaction(() => {
  if (schemaVersion() < 1) {
    db.exec(`
      ALTER TABLE orders ADD COLUMN payment TEXT NOT NULL DEFAULT 'cod';
      ALTER TABLE orders ADD COLUMN authority TEXT;
      ALTER TABLE orders ADD COLUMN ref_id TEXT;
      CREATE UNIQUE INDEX orders_authority ON orders (authority);
      PRAGMA user_version = 1;
    `);
  }
});

// v2: accounts can be phone-only (email and password become optional), orders get structured address fields, and
// one-time SMS codes get a table. SQLite can't relax NOT NULL in place, so users is rebuilt the documented way
// (new table, copy, drop, rename) with foreign keys off; that pragma is ignored inside a transaction, so it wraps it.
if (schemaVersion() < 2) {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    transaction(() => {
      if (schemaVersion() >= 2) return; // another build worker migrated first
      db.exec(`
        CREATE TABLE users_v2 (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          phone TEXT UNIQUE,
          password_hash TEXT,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_v2 (id, name, email, password_hash, is_admin, created_at)
          SELECT id, name, email, password_hash, is_admin, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_v2 RENAME TO users;
        ALTER TABLE orders ADD COLUMN province TEXT NOT NULL DEFAULT '';
        ALTER TABLE orders ADD COLUMN city TEXT NOT NULL DEFAULT '';
        ALTER TABLE orders ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
        CREATE TABLE otp_codes (
          phone TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          sent_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        PRAGMA user_version = 2;
      `);
      if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("users migration broke a foreign key");
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// v3: an hourly cap on SMS codes per phone, so nobody can flood a number (or the shop's SMS bill).
transaction(() => {
  if (schemaVersion() >= 3) return;
  db.exec(`
    ALTER TABLE otp_codes ADD COLUMN window_start INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE otp_codes ADD COLUMN sends INTEGER NOT NULL DEFAULT 0;
    PRAGMA user_version = 3;
  `);
});

// v4: products get a type (subcategory) for the side menu. Existing sample products get theirs by name; others stay ''.
transaction(() => {
  if (schemaVersion() >= 4) return;
  db.exec("ALTER TABLE products ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''");
  const backfill = db.prepare("UPDATE products SET subcategory = ? WHERE name = ? AND category = ?");
  for (const [name, , category, subcategory] of SAMPLE_PRODUCTS) backfill.run(subcategory, name, category);
  db.exec("PRAGMA user_version = 4");
});

// v5: categories get their own table, so the admin can create one before it has products, rename it and pick it from a list.
transaction(() => {
  if (schemaVersion() >= 5) return;
  db.exec(`
    CREATE TABLE categories (name TEXT PRIMARY KEY);
    INSERT INTO categories (name) SELECT DISTINCT category FROM products WHERE category != '';
    PRAGMA user_version = 5;
  `);
});

// v6: login lockout and the per-IP SMS limit move from server memory to the database, so a restart doesn't reset them,
// and the key that signs ?error= messages is kept here, so a restart doesn't break error links.
transaction(() => {
  if (schemaVersion() >= 6) return;
  db.exec(`
    CREATE TABLE login_failures (email TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX login_failures_email_ip ON login_failures (email, ip, at);
    CREATE INDEX login_failures_ip ON login_failures (ip, at);
    CREATE TABLE sms_ip_sends (ip TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX sms_ip_sends_ip ON sms_ip_sends (ip, at);
    CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version = 6;
  `);
});

// v7: post tracking codes and discount codes on orders, a "price before discount" for sales, extra product photos,
// discount codes, and a size guide per category.
transaction(() => {
  if (schemaVersion() >= 7) return;
  db.exec(`
    ALTER TABLE orders ADD COLUMN tracking_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN coupon TEXT NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN compare_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE categories ADD COLUMN size_guide TEXT NOT NULL DEFAULT '';
    CREATE TABLE product_images (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      path TEXT NOT NULL
    );
    CREATE INDEX product_images_product ON product_images (product_id, id);
    CREATE TABLE coupons (
      code TEXT PRIMARY KEY,
      percent INTEGER NOT NULL DEFAULT 0,  -- either a percentage off the goods…
      amount INTEGER NOT NULL DEFAULT 0,   -- …or a fixed amount in toman
      min_total INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER,                    -- NULL = unlimited
      used INTEGER NOT NULL DEFAULT 0,
      expires_on TEXT NOT NULL DEFAULT '', -- 'YYYY-MM-DD', last valid day (Tehran time); '' = never
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    PRAGMA user_version = 7;
  `);
});

/** Parses admin input lines like "M | مشکی | 10" into variants. */
export function parseVariants(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((parts) => parts.length === 3 && parts[0] && parts[1])
    .map(([size, color, stock]) => ({ size, color, stock: Math.max(0, Math.floor(Number(toLatinDigits(stock))) || 0) }));
}

/** The first line parseVariants would drop or misread, as a Persian error; a typo must not silently delete a variant. */
export function variantsProblem(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 100) return "حداکثر ۱۰۰ سایز و رنگ برای هر محصول";
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    const [size, color, stock, ...extra] = line.split("|").map((s) => s.trim());
    const at = `خط ${(i + 1).toLocaleString("fa-IR")}`;
    if (!size || !color || stock === undefined || extra.length) return `${at} باید به شکل «سایز | رنگ | موجودی» باشد`;
    if (size.length > 20 || color.length > 20) return `${at}: سایز و رنگ هر کدام حداکثر ۲۰ کاراکتر است`;
    if (!/^\d{1,5}$/.test(toLatinDigits(stock))) return `${at}: موجودی باید عدد صحیح ۰ تا ۹۹۹۹۹ باشد`;
    if (seen.has(`${size}|${color}`)) return `${at}: این سایز و رنگ تکراری است`;
    seen.add(`${size}|${color}`);
  }
  return null;
}

export function saveVariants(productId: number, text: string) {
  const variants = parseVariants(text);
  transaction(() => {
    const keep = new Set<number>();
    for (const v of variants) {
      const row = db
        .prepare(
          `INSERT INTO variants (product_id, size, color, stock) VALUES (?, ?, ?, ?)
           ON CONFLICT (product_id, size, color) DO UPDATE SET stock = excluded.stock
           RETURNING id`,
        )
        .get(productId, v.size, v.color, v.stock) as { id: number };
      keep.add(row.id);
    }
    for (const { id } of db.prepare("SELECT id FROM variants WHERE product_id = ?").all(productId) as { id: number }[]) {
      if (!keep.has(id)) db.prepare("DELETE FROM variants WHERE id = ?").run(id);
    }
  });
}

export type Coupon = {
  code: string;
  percent: number;
  amount: number;
  min_total: number;
  max_uses: number | null;
  used: number;
  expires_on: string;
  active: number;
};

/** Today's date in Iran (UTC+3:30, no daylight saving since 2022) as YYYY-MM-DD, the format coupons expire in. */
const tehranToday = (now = Date.now()) => new Date(now + 210 * 60_000).toISOString().slice(0, 10);

/** What a discount code takes off these goods (in toman), or a Persian reason it can't be used. */
export function couponDiscount(code: string, subtotal: number, now = Date.now()): { discount: number } | { error: string } {
  const c = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code) as Coupon | undefined;
  if (!c || !c.active) return { error: "کد تخفیف معتبر نیست" };
  if (c.expires_on && c.expires_on < tehranToday(now)) return { error: "مهلت استفاده از این کد تخفیف تمام شده است" };
  if (c.max_uses !== null && c.used >= c.max_uses) return { error: "ظرفیت استفاده از این کد تخفیف تمام شده است" };
  if (subtotal < c.min_total) return { error: `این کد تخفیف برای خرید از ${toman(c.min_total)} به بالاست` };
  return { discount: c.percent ? Math.floor((subtotal * c.percent) / 100) : Math.min(c.amount, subtotal) };
}

/** What the customer pays: goods minus the discount, plus shipping on what's left (so a code can't also unlock free shipping). */
export const orderTotal = (subtotal: number, discount = 0) => subtotal - discount + shippingCost(subtotal - discount);

// SQL for reports. Iran has no daylight saving time (since 2022), so "today" is UTC+3:30 all year.
export const TEHRAN = "'+210 minutes'";
// Orders that count as sales: not cancelled and not still waiting for online payment.
export const SOLD = "status NOT IN ('cancelled', 'awaiting_payment')";

export type CheckoutInfo = { name: string; phone: string; province: string; city: string; postal_code: string; address: string };

/**
 * Creates an order from cart {variantId: qty}, decrementing stock atomically. Throws a Persian message on failure.
 * Online orders start as awaiting_payment and hold their stock until paid or cancelled.
 */
export function placeOrder(userId: number, cart: Record<string, number>, info: CheckoutInfo, payment: "cod" | "online" = "cod", couponCode = "") {
  expireUnpaidOrders();
  return transaction(() => {
    let total = 0;
    const items = [];
    for (const [variantId, qty] of Object.entries(cart)) {
      if (!Number.isInteger(qty) || qty < 1) continue;
      const v = db
        .prepare(
          `SELECT v.id, v.size, v.color, v.stock, p.name, p.price FROM variants v
           JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.active = 1`,
        )
        .get(Number(variantId)) as { id: number; size: string; color: string; stock: number; name: string; price: number } | undefined;
      if (!v) continue; // deleted or hidden by the admin: the cart page no longer shows it either, so skip rather than block checkout
      if (v.stock < qty) throw new Error(`موجودی «${v.name}» (${v.size} / ${v.color}) کافی نیست`);
      total += v.price * qty;
      items.push({ ...v, qty });
    }
    if (items.length === 0) throw new Error("سبد خرید خالی است");
    let discount = 0;
    if (couponCode) {
      // Checked and counted in this same transaction, so two customers can't both take a code's last use.
      const result = couponDiscount(couponCode, total);
      if ("error" in result) throw new Error(result.error);
      discount = result.discount;
      db.prepare("UPDATE coupons SET used = used + 1 WHERE code = ?").run(couponCode);
    }
    total = orderTotal(total, discount);

    const order = db
      .prepare(
        `INSERT INTO orders (user_id, total, discount, coupon, name, phone, province, city, postal_code, address, payment, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        userId,
        total,
        discount,
        discount ? couponCode : "",
        info.name,
        info.phone,
        info.province,
        info.city,
        info.postal_code,
        info.address,
        payment,
        payment === "online" ? "awaiting_payment" : "pending",
      ) as { id: number };
    for (const it of items) {
      db.prepare("UPDATE variants SET stock = stock - ? WHERE id = ?").run(it.qty, it.id);
      db.prepare(
        "INSERT INTO order_items (order_id, variant_id, product_name, size, color, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(order.id, it.id, it.name, it.size, it.color, it.price, it.qty);
    }
    return order.id;
  });
}

/**
 * Cancels online orders left unpaid for 30 minutes so their stock can be sold again. Runs whenever orders are read or
 * placed, so no background job is needed. A late payment for one is never verified, so Zarinpal refunds it.
 */
export function expireUnpaidOrders() {
  const stale = db
    .prepare("SELECT id FROM orders WHERE status = 'awaiting_payment' AND created_at < datetime('now', '-30 minutes')")
    .all() as { id: number }[];
  for (const { id } of stale) cancelOrder(id);
}

/** Cancels an order and puts its items back in stock. Cancelling is final, so stock is only returned once. */
export function cancelOrder(orderId: number) {
  transaction(() => {
    if (!db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'").run(orderId).changes) return;
    // A cancelled order gives its discount code's use back.
    db.prepare("UPDATE coupons SET used = MAX(used - 1, 0) WHERE code = (SELECT coupon FROM orders WHERE id = ? AND coupon != '')").run(orderId);
    for (const it of db.prepare("SELECT variant_id, qty FROM order_items WHERE order_id = ?").all(orderId) as { variant_id: number; qty: number }[]) {
      db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?").run(it.qty, it.variant_id);
    }
  });
}

/** Deletes an order and its items for good. One that hasn't shipped is cancelled first, so its items go back in stock. */
export function purgeOrder(orderId: number) {
  transaction(() => {
    const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string } | undefined;
    if (order && ["awaiting_payment", "pending", "processing"].includes(order.status)) cancelOrder(orderId);
    db.prepare("DELETE FROM orders WHERE id = ?").run(orderId); // order_items go with it (ON DELETE CASCADE)
  });
}

// Sample products so a fresh install isn't empty. Inside a transaction because build workers import this in parallel.
function addSamples(samples: typeof SAMPLE_PRODUCTS) {
  for (const [name, description, category, subcategory, price, image, variants] of samples) {
    const p = db
      .prepare("INSERT INTO products (name, description, category, subcategory, price, image) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .get(name, description, category, subcategory, price, image) as { id: number };
    saveVariants(p.id, variants);
    db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(category);
  }
}
const fillSizeGuide = (name: string) =>
  db.prepare("UPDATE categories SET size_guide = ? WHERE name = ? AND size_guide = ''").run(SIZE_GUIDES[name], name);

transaction(() => {
  if (db.prepare("SELECT 1 FROM products LIMIT 1").get()) return;
  addSamples(SAMPLE_PRODUCTS);
});

// v8: standard size charts for the starter categories. After the sample seed, so a fresh install's categories get them too.
transaction(() => {
  if (schemaVersion() >= 8) return;
  for (const name of Object.keys(SIZE_GUIDES)) fillSizeGuide(name);
  db.exec("PRAGMA user_version = 8");
});

// v9: the glasses category (sunglasses, optical frames, blue-light) for shops that were set up before it existed.
transaction(() => {
  if (schemaVersion() >= 9) return;
  if (!db.prepare("SELECT 1 FROM products WHERE category = 'عینک'").get()) addSamples(SAMPLE_PRODUCTS.filter((s) => s[2] === "عینک"));
  fillSizeGuide("عینک");
  db.exec("PRAGMA user_version = 9");
});

// v10: how often each search was made (only searches that found products), for «جستجوهای پرطرفدار» in the search box.
transaction(() => {
  if (schemaVersion() >= 10) return;
  db.exec(`
    CREATE TABLE search_counts (q TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
    PRAGMA user_version = 10;
  `);
});

// v11: indexes for the order pages (items per order, a customer's orders) and the unpaid-order expiry check.
transaction(() => {
  if (schemaVersion() >= 11) return;
  db.exec(`
    CREATE INDEX order_items_order ON order_items (order_id);
    CREATE INDEX orders_user ON orders (user_id);
    CREATE INDEX orders_status_created ON orders (status, created_at);
    PRAGMA user_version = 11;
  `);
});

// v12: a color on each gallery photo ('' = any color), so picking a color on the product page shows its photos.
transaction(() => {
  if (schemaVersion() >= 12) return;
  db.exec(`
    ALTER TABLE product_images ADD COLUMN color TEXT NOT NULL DEFAULT '';
    PRAGMA user_version = 12;
  `);
});

/** Records a search that found products. The term is cut and spaces collapsed, so variants of one search add up. */
export function countSearch(q: string) {
  db.prepare("INSERT INTO search_counts (q, count) VALUES (?, 1) ON CONFLICT (q) DO UPDATE SET count = count + 1").run(q.trim().replace(/\s+/g, " ").slice(0, 50));
}

/** The 6 most-made searches; while there are fewer, product types (جین، کتانی…) fill the list. */
export function popularSearches(): string[] {
  const searched = (db.prepare("SELECT q FROM search_counts ORDER BY count DESC, q LIMIT 6").all() as { q: string }[]).map((r) => r.q);
  const types = (db.prepare("SELECT subcategory AS q FROM products WHERE active = 1 AND subcategory != '' GROUP BY subcategory ORDER BY MAX(id) DESC LIMIT 6").all() as { q: string }[]).map((r) => r.q);
  return [...new Set([...searched, ...types])].slice(0, 6);
}
