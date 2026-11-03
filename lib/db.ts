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
transaction(() => {
  if ((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version < 1) {
    db.exec(`
      ALTER TABLE orders ADD COLUMN payment TEXT NOT NULL DEFAULT 'cod';
      ALTER TABLE orders ADD COLUMN authority TEXT;
      ALTER TABLE orders ADD COLUMN ref_id TEXT;
      CREATE UNIQUE INDEX orders_authority ON orders (authority);
      PRAGMA user_version = 1;
    `);
  }
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

export type CheckoutInfo = { name: string; phone: string; address: string };

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
      if (!v) throw new Error("یکی از کالاهای سبد دیگر موجود نیست");
      if (v.stock < qty) throw new Error(`موجودی «${v.name}» (${v.size} / ${v.color}) کافی نیست`);
      total += v.price * qty;
      items.push({ ...v, qty });
    }
    if (items.length === 0) throw new Error("سبد خرید خالی است");

    const order = db
      .prepare("INSERT INTO orders (user_id, total, name, phone, address, payment, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .get(userId, total, info.name, info.phone, info.address, payment, payment === "online" ? "awaiting_payment" : "pending") as {
      id: number;
    };
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
  for (const [name, description, category, price, image, variants] of SAMPLE_PRODUCTS) {
    const p = db
      .prepare("INSERT INTO products (name, description, category, price, image) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .get(name, description, category, price, image) as { id: number };
    saveVariants(p.id, variants);
  }
});
