import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { db, cancelOrder, expireUnpaidOrders, parseVariants, placeOrder, purgeOrder } = await import("../lib/db.ts");
const { shippingCost } = await import("../lib/format.ts");
const { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } = await import("../lib/password.ts");

const user = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('t', 't@t.t', 'x') RETURNING id").get() as { id: number };
const stockOf = (id: number) => (db.prepare("SELECT stock FROM variants WHERE id = ?").get(id) as { stock: number }).stock;
const info = { name: "علی", phone: "09121234567", province: "تهران", city: "تهران", postal_code: "1234567890", address: "خیابان آزادی" };

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
  assert.equal((db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId) as { total: number }).total, v.price * 2 + shippingCost(v.price * 2));
  assert.equal(stockOf(v.id), v.stock - 2);
});

test("placeOrder rolls back everything when any item is short", () => {
  const [a, b] = db.prepare("SELECT id, stock FROM variants WHERE stock > 0 LIMIT 2").all() as { id: number; stock: number }[];
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
  assert.throws(() => placeOrder(user.id, { [a.id]: 1, [b.id]: b.stock + 1 }, info), /کافی نیست/);
  assert.equal(stockOf(a.id), a.stock);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS n FROM orders").get(), orders);
});

test("placeOrder skips cart items whose product was deleted or hidden, instead of blocking checkout", () => {
  const v = db.prepare("SELECT v.id, p.price FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock > 0 LIMIT 1").get() as { id: number; price: number };
  const gone = db.prepare("INSERT INTO products (name, price) VALUES ('حذف‌شده', 1000) RETURNING id").get() as { id: number };
  const goneVariant = db.prepare("INSERT INTO variants (product_id, size, color, stock) VALUES (?, 'M', 'x', 5) RETURNING id").get(gone.id) as { id: number };
  db.prepare("DELETE FROM products WHERE id = ?").run(gone.id); // what the admin's delete button does; variants cascade
  const orderId = placeOrder(user.id, { [v.id]: 1, [goneVariant.id]: 2 }, info);
  assert.equal((db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId) as { total: number }).total, v.price + shippingCost(v.price));
  assert.throws(() => placeOrder(user.id, { [goneVariant.id]: 1 }, info), /خالی/, "a cart of only deleted items is empty");
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

test("purgeOrder deletes the order and its items, returning stock only if it hadn't shipped", () => {
  const v = db.prepare("SELECT id, stock FROM variants WHERE stock >= 2 LIMIT 1").get() as { id: number; stock: number };
  const open = placeOrder(user.id, { [v.id]: 1 }, info);
  const shipped = placeOrder(user.id, { [v.id]: 1 }, info);
  db.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").run(shipped);
  purgeOrder(open);
  purgeOrder(shipped);
  assert.equal(stockOf(v.id), v.stock - 1);
  assert.equal(db.prepare("SELECT 1 FROM orders WHERE id IN (?, ?)").get(open, shipped), undefined);
  assert.equal(db.prepare("SELECT 1 FROM order_items WHERE order_id IN (?, ?)").get(open, shipped), undefined);
});

test("every sample product has a photo file and parseable variants", async () => {
  const { existsSync } = await import("node:fs");
  const { SAMPLE_PRODUCTS } = await import("../lib/samples.ts");
  for (const [name, , , , , image, variants] of SAMPLE_PRODUCTS) {
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

const EMAILS_OK = ["ali@example.com", "a.b+shop@mail.co.ir", "Ali_99@Sub.Example.travel"];
const EMAILS_BAD = ["ali", "ali@", "ali@example", "ali@example.c", "a li@example.com", "x@example.commmef", "a..b@x.com", ".a@x.com", "a.@x.com", "a@-x.com", "a@x-.com", "a@x..com", "علی@x.com", "a@x.c0m"];

test("names are 3-15 letters (spaces not counted); emails the common user@domain.tld form", async () => {
  const { emailProblem, nameProblem } = await import("../lib/validation.ts");
  // Spaces and the half-space don't count: «مریم‌سادات نیک» is 12 letters.
  for (const good of ["علی رضایی", "مریم‌سادات نیک", "Ali", "x".repeat(15), "ابوالفضل محمدی"]) assert.equal(nameProblem(good), null, good);
  for (const bad of ["عل", "Al", "x".repeat(16), "مریم‌السادات احمدی", "علی123", "<b>", " ", "علی_رضا", "--"]) assert.notEqual(nameProblem(bad), null, bad);
  for (const good of EMAILS_OK) assert.equal(emailProblem(good), null, good);
  for (const bad of [...EMAILS_BAD, `${"a".repeat(250)}@x.com`]) assert.notEqual(emailProblem(bad), null, bad);
});

test("the forms' name and email patterns agree with the server", async () => {
  const { emailProblem, nameProblem } = await import("../lib/validation.ts");
  const { EMAIL_PATTERN, NAME_PATTERN } = await import("../lib/rules.ts");
  const name = new RegExp(`^(?:${NAME_PATTERN})$`, "v"); // how browsers compile the pattern attribute
  for (const n of ["علی رضایی", "مریم‌سادات نیک", "عل", "x".repeat(16), "علی123", "<b>"]) assert.equal(name.test(n), nameProblem(n) === null, n);
  const email = new RegExp(String.raw`^(?:\s*(?:${EMAIL_PATTERN})\s*)$`, "v"); // the input wraps it in \s* (the server trims)
  for (const e of [...EMAILS_OK, ...EMAILS_BAD]) assert.equal(email.test(e), emailProblem(e) === null, e);
});

test("the client image URL pattern agrees with productProblem", async () => {
  const { productProblem } = await import("../lib/validation.ts");
  const { IMAGE_PATTERN } = await import("../lib/rules.ts");
  const pattern = new RegExp(`^(?:${IMAGE_PATTERN})$`, "v");
  const base = { name: "کلاه", price: 100000, description: "", subcategory: "" };
  for (const image of ["https://cdn.example.com/a.jpg", "http://x.ir/a b", "/uploads/a.png", "/", "//evil.com/a.png", "/\\evil.com", "javascript:alert(1)", "http://"]) {
    assert.equal(pattern.test(image), productProblem({ ...base, image }) === null, image);
  }
});

test("product rules: name, price range, image URL, and variant lines that would be lost", async () => {
  const { productProblem, likeContains } = await import("../lib/validation.ts");
  const { variantsProblem } = await import("../lib/db.ts");
  const base = { name: "کلاه", price: 100000, description: "", subcategory: "", image: "" };
  assert.equal(productProblem(base), null);
  for (const image of ["https://cdn.example.com/a.jpg", "/uploads/x.png"]) assert.equal(productProblem({ ...base, image }), null, image);
  for (const bad of [{ name: "ک" }, { name: "x".repeat(101) }, { price: 1.5 }, { price: 999 }, { price: 2e9 }, { price: NaN }, { description: "x".repeat(2001) }, { subcategory: "x" }, { image: "//evil.com/a.png" }, { image: "javascript:alert(1)" }, { image: "/\\evil.com" }]) {
    assert.notEqual(productProblem({ ...base, ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(variantsProblem("M | مشکی | 10\r\nL | سفید | ۵\n\n"), null, "CRLF, Persian digits and blank lines are fine");
  assert.equal(parseVariants("L | سفید | ۵")[0].stock, 5, "Persian-digit stock is read, not zeroed");
  for (const bad of ["M | مشکی 10", "M | مشکی | 10 | x", "M | مشکی | -1", "M | مشکی | ده", "M | مشکی | 1\nM | مشکی | 2", `${"x".repeat(21)} | a | 1`]) {
    assert.notEqual(variantsProblem(bad), null, bad);
  }
  assert.equal(likeContains("50%_off\\"), "%50\\%\\_off\\\\%");
});

test("uploads are recognized by their bytes, not their name", async () => {
  const { detectImageType } = await import("../lib/uploads.ts");
  assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpg");
  assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "png");
  assert.equal(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null, "SVG/HTML is refused");
  assert.equal(detectImageType(new TextEncoder().encode("GIF89a")), null);
});

test("phones and postal codes accept Persian digits and common prefixes", async () => {
  const { normalizePhone, normalizePostalCode, toLatinDigits } = await import("../lib/validation.ts");
  assert.equal(toLatinDigits("۰۹۱۲ ٣٤٥"), "0912 345");
  for (const ok of ["09121234567", "۰۹۱۲۱۲۳۴۵۶۷", "+989121234567", "00989121234567", "0912-123-4567"]) assert.equal(normalizePhone(ok), "09121234567", ok);
  for (const bad of ["9121234567", "0812123456", "0912123456", "091212345678", "abc"]) assert.equal(normalizePhone(bad), null, bad);
  assert.equal(normalizePostalCode("۱۲۳۴۵-۶۷۸۹۰"), "1234567890");
  assert.equal(normalizePostalCode("123456789"), null);
});

test("SMS codes: right code passes, wrong ones count, 3 tries, 3-minute expiry, resend and hourly limits", async () => {
  const { checkCode, consumeCode, createCode, resendWait, smsAllowedForIp } = await import("../lib/otp.ts");
  const phone = "09120000001";
  let t = 2_000_000_000_000;
  const code = createCode(phone, t);
  assert.match(code, /^\d{6}$/);
  assert.equal(checkCode(phone, code === "111111" ? "222222" : "111111", t), "کد وارد شده اشتباه است");
  assert.equal(checkCode(phone, code, t), null, "right code passes");
  assert.equal(checkCode(phone, code, t), null, "still valid until consumed (so a missing name can be fixed)");
  consumeCode(phone);
  assert.notEqual(checkCode(phone, code, t), null, "consumed code is gone");

  assert.throws(() => createCode("09120000002", t) && createCode("09120000002", t + 30_000), /صبر کنید/, "resend needs 1 minute");
  assert.equal(resendWait("09120000002", t + 30_000), 30, "countdown shows the seconds left");
  assert.equal(resendWait("09120000002", t + 61_000), 0, "no wait after a minute");
  assert.equal(resendWait("09129999999", t), 0, "no wait for a phone that never got a code");
  const late = createCode("09120000003", t);
  assert.notEqual(checkCode("09120000003", late, t + 3 * 60_000 + 1), null, "expired after 3 minutes");

  const brute = createCode("09120000004", t);
  const wrong = brute === "000000" ? "111111" : "000000";
  for (let i = 0; i < 3; i++) checkCode("09120000004", wrong, t);
  assert.notEqual(checkCode("09120000004", brute, t), null, "locked after 3 wrong tries");

  for (let i = 0; i < 5; i++) createCode("09120000005", (t += 61_000));
  assert.throws(() => createCode("09120000005", (t += 61_000)), /یک ساعت/, "6th code in an hour refused");
  assert.doesNotThrow(() => createCode("09120000005", t + 60 * 60_000), "allowed again after the hour");

  for (let i = 0; i < 10; i++) assert.ok(smsAllowedForIp("1.2.3.4", t + i), "10 codes per IP per hour");
  assert.equal(smsAllowedForIp("1.2.3.4", t + 10), false, "11th code from the same IP refused");
  assert.ok(smsAllowedForIp("5.6.7.8", t + 10), "other IPs unaffected");
  assert.ok(smsAllowedForIp("1.2.3.4", t + 60 * 60_000), "allowed again after the hour");
});

test("?error= banners show only messages the server signed", async () => {
  const { errorParam, readErrorParam } = await import("../lib/validation.ts");
  const value = decodeURIComponent(errorParam("کد وارد شده اشتباه است"));
  assert.equal(readErrorParam(value), "کد وارد شده اشتباه است");
  assert.equal(readErrorParam(value.replace("اشتباه", "مسدود")), null, "edited message rejected");
  assert.equal(readErrorParam("حساب شما مسدود شد؛ با ۰۹۱۲ تماس بگیرید"), null, "unsigned text rejected");
  assert.equal(readErrorParam(["a", "b"]), null);
  const stored = db.prepare("SELECT value FROM settings WHERE name = 'error_key'").get() as { value: string } | undefined;
  assert.match(stored?.value ?? "", /^[0-9a-f]{64}$/, "signing key kept in the database, so links survive a restart");
});

test("login lockout and the per-IP SMS limit are stored in the database", async () => {
  const { smsAllowedForIp } = await import("../lib/otp.ts");
  const t = Date.now();
  recordLoginFailure("db@x.zz", "9.9.9.9", t);
  smsAllowedForIp("9.9.9.9", t);
  assert.ok(db.prepare("SELECT 1 FROM login_failures WHERE email = 'db@x.zz'").get());
  assert.ok(db.prepare("SELECT 1 FROM sms_ip_sends WHERE ip = '9.9.9.9'").get());
});

test("?next= only allows same-site paths", async () => {
  const { safeNext } = await import("../lib/validation.ts");
  for (const bad of ["/\\evil.com", "//evil.com", "/\t/evil.com", "https://evil.com", "javascript:alert(1)", 42, undefined]) {
    assert.equal(safeNext(bad), "/", `rejects ${String(bad)}`);
  }
  assert.equal(safeNext("/cart?x=1#top"), "/cart?x=1#top");
  assert.equal(safeNext("/admin"), "/admin");
});

test("passwords verify only with the right password", async () => {
  const stored = await hashPassword("secret123");
  assert.ok(await verifyPassword("secret123", stored));
  assert.ok(!(await verifyPassword("wrong", stored)));
});

test("login locks after 5 failures in 15 minutes and unlocks after", () => {
  const t = 1_000_000_000;
  const ip = "1.1.1.1";
  for (let i = 0; i < 4; i++) recordLoginFailure("x@y.zz", ip, t + i);
  assert.ok(!loginLocked("x@y.zz", ip, t + 10), "4 failures: still open");
  recordLoginFailure("x@y.zz", ip, t + 5);
  assert.ok(loginLocked("x@y.zz", ip, t + 10), "5 failures: locked");
  assert.ok(!loginLocked("x@y.zz", "2.2.2.2", t + 10), "an attacker's failures don't lock the owner out on their own IP");
  assert.ok(!loginLocked("x@y.zz", ip, t + 15 * 60 * 1000 + 10), "window passed: open again");
  for (let i = 0; i < 5; i++) recordLoginFailure("a@b.cc", ip, t);
  clearLoginFailures("a@b.cc");
  assert.ok(!loginLocked("a@b.cc", ip, t), "successful login clears");

  const sprayer = "3.3.3.3";
  for (let i = 0; i < 20; i++) recordLoginFailure(`user${i}@b.cc`, sprayer, t);
  assert.ok(loginLocked("someone-new@b.cc", sprayer, t + 10), "20 failures from one IP lock that IP for every email");
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

test("every province has its city list", async () => {
  const { CITIES } = await import("../lib/cities.ts");
  const { PROVINCES } = await import("../lib/format.ts");
  assert.deepEqual(Object.keys(CITIES).sort(), [...PROVINCES].sort());
  for (const p of PROVINCES) assert.ok(CITIES[p].length > 0, p);
  assert.ok(CITIES["تهران"].includes("تهران") && CITIES["اصفهان"].includes("کاشان"));
});

test("shipping is 85,000 toman below 5,000,000 and free from it", () => {
  assert.equal(shippingCost(4_999_999), 85_000);
  assert.equal(shippingCost(5_000_000), 0);
  assert.equal(shippingCost(7_000_000), 0);
});
