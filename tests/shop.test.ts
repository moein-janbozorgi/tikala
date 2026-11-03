import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { db, cancelOrder, expireUnpaidOrders, parseVariants, placeOrder } = await import("../lib/db.ts");
const { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } = await import("../lib/password.ts");

const user = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('t', 't@t.t', 'x') RETURNING id").get() as { id: number };
const stockOf = (id: number) => (db.prepare("SELECT stock FROM variants WHERE id = ?").get(id) as { stock: number }).stock;
const info = { name: "علی", phone: "09121234567", address: "تهران" };

test("parseVariants keeps valid lines and clamps stock", () => {
  assert.deepEqual(parseVariants("M | مشکی | 3\nbad line\nL | سفید | -2\nXL | آبی | x"), [
    { size: "M", color: "مشکی", stock: 3 },
    { size: "L", color: "سفید", stock: 0 },
    { size: "XL", color: "آبی", stock: 0 },
  ]);
});

test("placeOrder charges the right total and decrements stock", () => {
  const v = db.prepare("SELECT v.id, v.stock, p.price FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock >= 2 LIMIT 1").get() as {
    id: number;
    stock: number;
    price: number;
  };
  const orderId = placeOrder(user.id, { [v.id]: 2 }, info);
  assert.equal((db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId) as { total: number }).total, v.price * 2);
  assert.equal(stockOf(v.id), v.stock - 2);
});

test("placeOrder rolls back everything when any item is short", () => {
  const [a, b] = db.prepare("SELECT id, stock FROM variants WHERE stock > 0 LIMIT 2").all() as { id: number; stock: number }[];
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
  assert.throws(() => placeOrder(user.id, { [a.id]: 1, [b.id]: b.stock + 1 }, info), /کافی نیست/);
  assert.equal(stockOf(a.id), a.stock);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS n FROM orders").get(), orders);
});

test("placeOrder ignores bad quantities and rejects an empty cart", () => {
  assert.throws(() => placeOrder(user.id, { 1: -5, 2: 1.5 } as Record<string, number>, info), /خالی/);
});

test("online orders await payment, and cancelling returns stock exactly once", () => {
  const v = db.prepare("SELECT id, stock FROM variants WHERE stock >= 1 LIMIT 1").get() as { id: number; stock: number };
  const orderId = placeOrder(user.id, { [v.id]: 1 }, info, "online");
  assert.deepEqual({ ...(db.prepare("SELECT status, payment FROM orders WHERE id = ?").get(orderId) as object) }, {
    status: "awaiting_payment",
    payment: "online",
  });
  assert.equal(stockOf(v.id), v.stock - 1);
  cancelOrder(orderId);
  cancelOrder(orderId);
  assert.equal(stockOf(v.id), v.stock);
});

test("every sample product has a photo file and parseable variants", async () => {
  const { existsSync } = await import("node:fs");
  const { SAMPLE_PRODUCTS } = await import("../lib/samples.ts");
  for (const [name, , , , image, variants] of SAMPLE_PRODUCTS) {
    assert.ok(existsSync(`public${image}`), `missing ${image} for ${name}`);
    assert.ok(parseVariants(variants).length > 0, `no variants for ${name}`);
  }
});

test("new passwords need 8-64 chars, a letter, a digit, and a matching confirmation", () => {
  const ok = (p: string, c = p) => passwordProblem(p, c) === null;
  assert.ok(ok("password1"));
  assert.ok(ok("رمزعبور۱۲۳"), "Persian letters and digits count");
  assert.ok(!ok("pass1"), "too short");
  assert.ok(!ok("a1".repeat(33)), "too long");
  assert.ok(!ok("password"), "no digit");
  assert.ok(!ok("12345678"), "no letter");
  assert.ok(!ok("password1", "password2"), "confirmation mismatch");
});

test("register names are 2-50 letters/spaces and emails need a real-looking domain", async () => {
  const { emailProblem, nameProblem } = await import("../lib/validation.ts");
  for (const good of ["علی رضایی", "مریم‌السادات", "John Smith", "Al"]) assert.equal(nameProblem(good), null, good);
  for (const bad of ["ع", " ", "علی123", "<script>", "x".repeat(51), "--"]) assert.notEqual(nameProblem(bad), null, bad);
  for (const good of ["ali@example.com", "a.b+shop@mail.co.ir"]) assert.equal(emailProblem(good), null, good);
  for (const bad of ["ali", "ali@", "ali@example", "ali@example.c", "a li@example.com", `${"a".repeat(250)}@x.com`]) assert.notEqual(emailProblem(bad), null, bad);
});

test("passwords verify only with the right password", async () => {
  const stored = await hashPassword("secret123");
  assert.ok(await verifyPassword("secret123", stored));
  assert.ok(!(await verifyPassword("wrong", stored)));
});

test("login locks after 5 failures in 15 minutes and unlocks after", () => {
  const t = 1_000_000_000;
  for (let i = 0; i < 4; i++) recordLoginFailure("x@y.zz", t + i);
  assert.ok(!loginLocked("x@y.zz", t + 10), "4 failures: still open");
  recordLoginFailure("x@y.zz", t + 5);
  assert.ok(loginLocked("x@y.zz", t + 10), "5 failures: locked");
  assert.ok(!loginLocked("x@y.zz", t + 15 * 60 * 1000 + 10), "window passed: open again");
  for (let i = 0; i < 5; i++) recordLoginFailure("a@b.cc", t);
  clearLoginFailures("a@b.cc");
  assert.ok(!loginLocked("a@b.cc", t), "successful login clears");
});

test("unpaid online orders expire after 30 minutes and return stock", () => {
  const v = db.prepare("SELECT id, stock FROM variants WHERE stock >= 2 LIMIT 1").get() as { id: number; stock: number };
  const old = placeOrder(user.id, { [v.id]: 1 }, info, "online");
  const fresh = placeOrder(user.id, { [v.id]: 1 }, info, "online");
  db.prepare("UPDATE orders SET created_at = datetime('now', '-31 minutes') WHERE id = ?").run(old);
  expireUnpaidOrders();
  const status = (id: number) => (db.prepare("SELECT status FROM orders WHERE id = ?").get(id) as { status: string }).status;
  assert.equal(status(old), "cancelled");
  assert.equal(status(fresh), "awaiting_payment");
  assert.equal(stockOf(v.id), v.stock - 1, "only the expired order's item came back");
});
