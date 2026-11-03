import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SAMPLE_PRODUCTS } from "./samples.ts";

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

/** Parses admin input lines like "M | مشکی | 10" into variants. */
export function parseVariants(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((parts) => parts.length === 3 && parts[0] && parts[1])
    .map(([size, color, stock]) => ({ size, color, stock: Math.max(0, Math.floor(Number(stock)) || 0) }));
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

export type CheckoutInfo = { name: string; phone: string; province: string; city: string; postal_code: string; address: string };

/**
 * Creates an order from cart {variantId: qty}, decrementing stock atomically. Throws a Persian message on failure.
 * Online orders start as awaiting_payment and hold their stock until paid or cancelled.
 */
export function placeOrder(userId: number, cart: Record<string, number>, info: CheckoutInfo, payment: "cod" | "online" = "cod") {
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

    const order = db
      .prepare(
        `INSERT INTO orders (user_id, total, name, phone, province, city, postal_code, address, payment, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        userId,
        total,
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
    for (const it of db.prepare("SELECT variant_id, qty FROM order_items WHERE order_id = ?").all(orderId) as { variant_id: number; qty: number }[]) {
      db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?").run(it.qty, it.variant_id);
    }
  });
}

// Sample products so a fresh install isn't empty. Inside a transaction because build workers import this in parallel.
transaction(() => {
  if (db.prepare("SELECT 1 FROM products LIMIT 1").get()) return;
  for (const [name, description, category, subcategory, price, image, variants] of SAMPLE_PRODUCTS) {
    const p = db
      .prepare("INSERT INTO products (name, description, category, subcategory, price, image) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .get(name, description, category, subcategory, price, image) as { id: number };
    saveVariants(p.id, variants);
    db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(category);
  }
});
