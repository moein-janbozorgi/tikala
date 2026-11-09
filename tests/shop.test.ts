import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A real file, not :memory: (libSQL gives an in-memory database a single connection, so two orders at once can't
// even be tried there). Like Turso, a file lets a second write transaction wait for the first.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "shop-test-")), "shop.db");
const { db, cancelOrder, expireUnpaidOrders, parseVariants, placeOrder, purgeOrder } = await import("../lib/db.ts");
const { shippingCost } = await import("../lib/format.ts");
const { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } = await import("../lib/password.ts");

const user = (await db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('t', 't@t.t', 'x') RETURNING id").get()) as { id: number };
const stockOf = async (id: number) => ((await db.prepare("SELECT stock FROM variants WHERE id = ?").get(id)) as { stock: number }).stock;
const info = { name: "علی", phone: "09121234567", province: "تهران", city: "تهران", postal_code: "1234567890", address: "خیابان آزادی" };

test("parseVariants keeps valid lines and clamps stock", async () => {
  assert.deepEqual(parseVariants("M | مشکی | 3\nbad line\nL | سفید | -2\nXL | آبی | x"), [
    { size: "M", color: "مشکی", stock: 3 },
    { size: "L", color: "سفید", stock: 0 },
    { size: "XL", color: "آبی", stock: 0 },
  ]);
});

test("placeOrder charges the right total and decrements stock", async () => {
  const v = (await db.prepare("SELECT v.id, v.stock, p.price FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock >= 2 LIMIT 1").get()) as {
    id: number;
    stock: number;
    price: number;
  };
  const orderId = await placeOrder(user.id, { [v.id]: 2 }, info);
  assert.equal(((await db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId)) as { total: number }).total, v.price * 2 + shippingCost(v.price * 2));
  assert.equal(await stockOf(v.id), v.stock - 2);
});

test("placeOrder rolls back everything when any item is short", async () => {
  const [a, b] = (await db.prepare("SELECT id, stock FROM variants WHERE stock > 0 LIMIT 2").all()) as { id: number; stock: number }[];
  const orders = (await db.prepare("SELECT COUNT(*) AS n FROM orders").get()) as { n: number };
  await assert.rejects(async () => await placeOrder(user.id, { [a.id]: 1, [b.id]: b.stock + 1 }, info), /کافی نیست/);
  assert.equal(await stockOf(a.id), a.stock);
  assert.deepEqual(await db.prepare("SELECT COUNT(*) AS n FROM orders").get(), orders);
});

test("placeOrder skips cart items whose product was deleted or hidden, instead of blocking checkout", async () => {
  const v = (await db.prepare("SELECT v.id, p.price FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock > 0 LIMIT 1").get()) as { id: number; price: number };
  const gone = (await db.prepare("INSERT INTO products (name, price) VALUES ('حذف‌شده', 1000) RETURNING id").get()) as { id: number };
  const goneVariant = (await db.prepare("INSERT INTO variants (product_id, size, color, stock) VALUES (?, 'M', 'x', 5) RETURNING id").get(gone.id)) as { id: number };
  await db.prepare("DELETE FROM products WHERE id = ?").run(gone.id); // what the admin's delete button does; variants cascade
  const orderId = await placeOrder(user.id, { [v.id]: 1, [goneVariant.id]: 2 }, info);
  assert.equal(((await db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId)) as { total: number }).total, v.price + shippingCost(v.price));
  await assert.rejects(async () => await placeOrder(user.id, { [goneVariant.id]: 1 }, info), /خالی/, "a cart of only deleted items is empty");
});

test("placeOrder ignores bad quantities and rejects an empty cart", async () => {
  await assert.rejects(async () => await placeOrder(user.id, { 1: -5, 2: 1.5 } as Record<string, number>, info), /خالی/);
});

test("online orders await payment, and cancelling returns stock exactly once", async () => {
  const v = (await db.prepare("SELECT id, stock FROM variants WHERE stock >= 1 LIMIT 1").get()) as { id: number; stock: number };
  const orderId = await placeOrder(user.id, { [v.id]: 1 }, info, "online");
  assert.deepEqual({ ...((await db.prepare("SELECT status, payment FROM orders WHERE id = ?").get(orderId)) as object) }, {
    status: "awaiting_payment",
    payment: "online",
  });
  assert.equal(await stockOf(v.id), v.stock - 1);
  await cancelOrder(orderId);
  await cancelOrder(orderId);
  assert.equal(await stockOf(v.id), v.stock);
});

test("purgeOrder deletes the order and its items, returning stock only if it hadn't shipped", async () => {
  const v = (await db.prepare("SELECT id, stock FROM variants WHERE stock >= 2 LIMIT 1").get()) as { id: number; stock: number };
  const open = await placeOrder(user.id, { [v.id]: 1 }, info);
  const shipped = await placeOrder(user.id, { [v.id]: 1 }, info);
  await db.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").run(shipped);
  await purgeOrder(open);
  await purgeOrder(shipped);
  assert.equal(await stockOf(v.id), v.stock - 1);
  assert.equal(await db.prepare("SELECT 1 FROM orders WHERE id IN (?, ?)").get(open, shipped), undefined);
  assert.equal(await db.prepare("SELECT 1 FROM order_items WHERE order_id IN (?, ?)").get(open, shipped), undefined);
});

test("every sample product has a photo file and parseable variants", async () => {
  const { existsSync } = await import("node:fs");
  const { SAMPLE_PRODUCTS } = await import("../lib/samples.ts");
  for (const [name, , , , , image, variants] of SAMPLE_PRODUCTS) {
    assert.ok(existsSync(`public${image}`), `missing ${image} for ${name}`);
    assert.ok(parseVariants(variants).length > 0, `no variants for ${name}`);
  }
});

test("new passwords need 8-64 chars, a letter, a digit, and a matching confirmation", async () => {
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
  const { normalizePhone, normalizePostalCode, toLatinDigits, toPersianDigits } = await import("../lib/validation.ts");
  assert.equal(toLatinDigits("۰۹۱۲ ٣٤٥"), "0912 345");
  assert.equal(toPersianDigits("کد 0912-345"), "کد ۰۹۱۲-۳۴۵");
  assert.equal(toLatinDigits(toPersianDigits(1234567890)), "1234567890");
  for (const ok of ["09121234567", "۰۹۱۲۱۲۳۴۵۶۷", "+989121234567", "00989121234567", "0912-123-4567"]) assert.equal(normalizePhone(ok), "09121234567", ok);
  for (const bad of ["9121234567", "0812123456", "0912123456", "091212345678", "abc"]) assert.equal(normalizePhone(bad), null, bad);
  assert.equal(normalizePostalCode("۱۲۳۴۵-۶۷۸۹۰"), "1234567890");
  assert.equal(normalizePostalCode("123456789"), null);
});

test("SMS codes: right code passes, wrong ones count, 3 tries, 3-minute expiry, resend and hourly limits", async () => {
  const { checkCode, consumeCode, createCode, resendWait, smsAllowedForIp } = await import("../lib/otp.ts");
  const phone = "09120000001";
  let t = 2_000_000_000_000;
  const code = await createCode(phone, t);
  assert.match(code, /^\d{6}$/);
  assert.equal(await checkCode(phone, code === "111111" ? "222222" : "111111", t), "کد وارد شده اشتباه است");
  assert.equal(await checkCode(phone, code, t), null, "right code passes");
  assert.equal(await checkCode(phone, code, t), null, "still valid until consumed (so a missing name can be fixed)");
  await consumeCode(phone);
  assert.notEqual(await checkCode(phone, code, t), null, "consumed code is gone");

  await assert.rejects(async () => await createCode("09120000002", t) && await createCode("09120000002", t + 30_000), /صبر کنید/, "resend needs 1 minute");
  assert.equal(await resendWait("09120000002", t + 30_000), 30, "countdown shows the seconds left");
  assert.equal(await resendWait("09120000002", t + 61_000), 0, "no wait after a minute");
  assert.equal(await resendWait("09129999999", t), 0, "no wait for a phone that never got a code");
  const late = await createCode("09120000003", t);
  assert.notEqual(await checkCode("09120000003", late, t + 3 * 60_000 + 1), null, "expired after 3 minutes");

  const brute = await createCode("09120000004", t);
  const wrong = brute === "000000" ? "111111" : "000000";
  for (let i = 0; i < 3; i++) await checkCode("09120000004", wrong, t);
  assert.notEqual(await checkCode("09120000004", brute, t), null, "locked after 3 wrong tries");

  for (let i = 0; i < 5; i++) await createCode("09120000005", (t += 61_000));
  await assert.rejects(async () => await createCode("09120000005", (t += 61_000)), /یک ساعت/, "6th code in an hour refused");
  await assert.doesNotReject(async () => await createCode("09120000005", t + 60 * 60_000), "allowed again after the hour");

  for (let i = 0; i < 10; i++) assert.ok(await smsAllowedForIp("1.2.3.4", t + i), "10 codes per IP per hour");
  assert.equal(await smsAllowedForIp("1.2.3.4", t + 10), false, "11th code from the same IP refused");
  assert.ok(await smsAllowedForIp("5.6.7.8", t + 10), "other IPs unaffected");
  assert.ok(await smsAllowedForIp("1.2.3.4", t + 60 * 60_000), "allowed again after the hour");
});

test("?error= banners show only messages the server signed", async () => {
  const { errorParam, readErrorParam } = await import("../lib/validation.ts");
  const value = decodeURIComponent(errorParam("کد وارد شده اشتباه است"));
  assert.equal(readErrorParam(value), "کد وارد شده اشتباه است");
  assert.equal(readErrorParam(value.replace("اشتباه", "مسدود")), null, "edited message rejected");
  assert.equal(readErrorParam("حساب شما مسدود شد؛ با ۰۹۱۲ تماس بگیرید"), null, "unsigned text rejected");
  assert.equal(readErrorParam(["a", "b"]), null);
  const stored = (await db.prepare("SELECT value FROM settings WHERE name = 'error_key'").get()) as { value: string } | undefined;
  assert.match(stored?.value ?? "", /^[0-9a-f]{64}$/, "signing key kept in the database, so links survive a restart");
});

test("login lockout and the per-IP SMS limit are stored in the database", async () => {
  const { smsAllowedForIp } = await import("../lib/otp.ts");
  const t = Date.now();
  await recordLoginFailure("db@x.zz", "9.9.9.9", t);
  await smsAllowedForIp("9.9.9.9", t);
  assert.ok(await db.prepare("SELECT 1 FROM login_failures WHERE email = 'db@x.zz'").get());
  assert.ok(await db.prepare("SELECT 1 FROM sms_ip_sends WHERE ip = '9.9.9.9'").get());
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

test("login locks after 5 failures in 15 minutes and unlocks after", async () => {
  const t = 1_000_000_000;
  const ip = "1.1.1.1";
  for (let i = 0; i < 4; i++) await recordLoginFailure("x@y.zz", ip, t + i);
  assert.ok(!await loginLocked("x@y.zz", ip, t + 10), "4 failures: still open");
  await recordLoginFailure("x@y.zz", ip, t + 5);
  assert.ok(await loginLocked("x@y.zz", ip, t + 10), "5 failures: locked");
  assert.ok(!await loginLocked("x@y.zz", "2.2.2.2", t + 10), "an attacker's failures don't lock the owner out on their own IP");
  assert.ok(!await loginLocked("x@y.zz", ip, t + 15 * 60 * 1000 + 10), "window passed: open again");
  for (let i = 0; i < 5; i++) await recordLoginFailure("a@b.cc", ip, t);
  await clearLoginFailures("a@b.cc");
  assert.ok(!await loginLocked("a@b.cc", ip, t), "successful login clears");

  const sprayer = "3.3.3.3";
  for (let i = 0; i < 20; i++) await recordLoginFailure(`user${i}@b.cc`, sprayer, t);
  assert.ok(await loginLocked("someone-new@b.cc", sprayer, t + 10), "20 failures from one IP lock that IP for every email");
});

test("unpaid online orders expire after 30 minutes and return stock", async () => {
  const v = (await db.prepare("SELECT id, stock FROM variants WHERE stock >= 2 LIMIT 1").get()) as { id: number; stock: number };
  const old = await placeOrder(user.id, { [v.id]: 1 }, info, "online");
  const fresh = await placeOrder(user.id, { [v.id]: 1 }, info, "online");
  await db.prepare("UPDATE orders SET created_at = datetime('now', '-31 minutes') WHERE id = ?").run(old);
  await expireUnpaidOrders();
  const status = async (id: number) => ((await db.prepare("SELECT status FROM orders WHERE id = ?").get(id)) as { status: string }).status;
  assert.equal(await status(old), "cancelled");
  assert.equal(await status(fresh), "awaiting_payment");
  assert.equal(await stockOf(v.id), v.stock - 1, "only the expired order's item came back");
});

test("every province has its city list", async () => {
  const { CITIES } = await import("../lib/cities.ts");
  const { PROVINCES } = await import("../lib/format.ts");
  assert.deepEqual(Object.keys(CITIES).sort(), [...PROVINCES].sort());
  for (const p of PROVINCES) assert.ok(CITIES[p].length > 0, p);
  assert.ok(CITIES["تهران"].includes("تهران") && CITIES["اصفهان"].includes("کاشان"));
});

test("shipping is 85,000 toman below 5,000,000 and free from it", async () => {
  assert.equal(shippingCost(4_999_999), 85_000);
  assert.equal(shippingCost(5_000_000), 0);
  assert.equal(shippingCost(7_000_000), 0);
});

test("discount codes: percent or capped amount, minimum, expiry, use limit, inactive", async () => {
  const { couponDiscount } = await import("../lib/db.ts");
  const add = (code: string, fields: Record<string, number | string | null>) =>
    db.prepare(`INSERT INTO coupons (code, ${Object.keys(fields).join(", ")}) VALUES (?, ${Object.keys(fields).map(() => "?").join(", ")})`).run(code, ...Object.values(fields));
  await add("P20", { percent: 20 });
  await add("A50K", { amount: 50_000, min_total: 200_000 });
  await add("OLD", { percent: 10, expires_on: "2026-01-01" });
  await add("ONCE", { percent: 10, max_uses: 1, used: 1 });
  await add("OFF", { percent: 10, active: 0 });
  assert.deepEqual(await couponDiscount("P20", 123_456), { discount: 24_691 }, "20%, rounded down to whole toman");
  assert.deepEqual(await couponDiscount("A50K", 300_000), { discount: 50_000 });
  assert.ok("error" in await couponDiscount("A50K", 199_999), "below the minimum");
  assert.deepEqual(await couponDiscount("OLD", 100_000, Date.parse("2026-01-01T20:00:00Z")), { discount: 10_000 }, "still valid on its last day (Tehran time)");
  assert.ok("error" in await couponDiscount("OLD", 100_000, Date.parse("2026-01-01T21:00:00Z")), "expired once Tehran's next day starts");
  for (const code of ["ONCE", "OFF", "NOPE"]) assert.ok("error" in await couponDiscount(code, 100_000), code);
});

test("placeOrder applies a code, counts its use atomically, and cancelling gives the use back", async () => {
  const { orderTotal } = await import("../lib/db.ts");
  await db.prepare("INSERT INTO coupons (code, percent, max_uses) VALUES ('LAST1', 10, 1)").run();
  const v = (await db.prepare("SELECT v.id, p.price FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock >= 2 LIMIT 1").get()) as { id: number; price: number };
  const orderId = await placeOrder(user.id, { [v.id]: 1 }, info, "cod", "LAST1");
  const order = (await db.prepare("SELECT total, discount, coupon FROM orders WHERE id = ?").get(orderId)) as { total: number; discount: number; coupon: string };
  assert.equal(order.discount, Math.floor(v.price / 10));
  assert.equal(order.coupon, "LAST1");
  assert.equal(order.total, orderTotal(v.price, order.discount), "shipping charged on the discounted amount");
  await assert.rejects(async () => await placeOrder(user.id, { [v.id]: 1 }, info, "cod", "LAST1"), /ظرفیت/, "the only use is taken");
  await cancelOrder(orderId);
  assert.equal(((await db.prepare("SELECT used FROM coupons WHERE code = 'LAST1'").get()) as { used: number }).used, 0, "cancel returns the use");
});

test("admin discount-code rules", async () => {
  const { couponProblem, normalizeCoupon } = await import("../lib/validation.ts");
  const base = { code: "YALDA30", percent: 30, amount: 0, min_total: 0, max_uses: null, expires_on: "" };
  assert.equal(couponProblem(base), null);
  assert.equal(normalizeCoupon(" yalda ۳۰ "), "YALDA30");
  for (const bad of [{ code: "AB" }, { code: "یلدا" }, { percent: 0 }, { percent: 91 }, { percent: 10, amount: 5000 }, { percent: 0, amount: 500 }, { max_uses: 0 }, { min_total: -1 }, { expires_on: "1404-10-01x" }]) {
    assert.notEqual(couponProblem({ ...base, ...bad }), null, JSON.stringify(bad));
  }
});

test("sale prices: before-price must be higher; percent off is whole", async () => {
  const { productProblem } = await import("../lib/validation.ts");
  const { percentOff } = await import("../lib/format.ts");
  const base = { name: "کلاه", price: 80_000, description: "", subcategory: "", image: "" };
  assert.equal(productProblem({ ...base, compare_price: 100_000 }), null);
  assert.equal(productProblem({ ...base, compare_price: 0 }), null, "0 = not on sale");
  for (const compare_price of [80_000, 70_000, 1.5e5 + 0.5]) assert.notEqual(productProblem({ ...base, compare_price }), null, String(compare_price));
  assert.equal(percentOff(80_000, 100_000), 20);
  assert.equal(percentOff(100_000, 0), 0);
});

test("CSV export quotes every cell and defuses Excel formulas", async () => {
  const { csv } = await import("../lib/csv.ts");
  assert.equal(csv([["a", 'say "hi"', null], ["=HYPERLINK(\"x\")", "-1", "09121234567"]]), '"a","say ""hi""",""\r\n"\'=HYPERLINK(""x"")","\'-1","09121234567"');
});

test("every starter category gets a size guide listing each size its products use", async () => {
  for (const c of (await db.prepare("SELECT name, size_guide FROM categories").all()) as { name: string; size_guide: string }[]) {
    const listed = new Set(c.size_guide.split("\n").map((l) => l.split("|")[0].trim()));
    const used = (await db.prepare("SELECT DISTINCT v.size FROM variants v JOIN products p ON p.id = v.product_id WHERE p.category = ?").all(c.name)) as { size: string }[];
    for (const { size } of used) assert.ok(listed.has(size), `${c.name}: size ${size} missing from its guide`);
  }
});

test("popular searches: most-made first, spaces collapsed, product types fill the rest", async () => {
  const { countSearch, popularSearches } = await import("../lib/db.ts");
  const before = await popularSearches();
  assert.equal(before.length, 6); // sample products alone fill the list with types
  await countSearch("هودی");
  await countSearch("کفش  چرم");
  await countSearch(" کفش چرم ");
  const list = await popularSearches();
  assert.deepEqual(list.slice(0, 2), ["کفش چرم", "هودی"]);
  assert.equal(list.length, 6);
  assert.equal(new Set(list).size, 6);
});

test("product listing: home shows pages 1..N, the API one page at a time, with filters applied", async () => {
  const { listProducts, PAGE_SIZE } = await import("../lib/products.ts");
  const all = await listProducts({});
  assert.ok(all.total > PAGE_SIZE * 2); // the samples span several pages
  const ids = async (params: Record<string, string>, only = false) => (await listProducts(params, only)).products.map((p) => p.id);
  const [p1, p2] = [await ids({ page: "1" }, true), await ids({ page: "2" }, true)];
  assert.equal(p1.length, PAGE_SIZE);
  assert.deepEqual(await ids({ page: "2" }), [...p1, ...p2]); // home ?page=2 = API pages 1 and 2, in order, no overlap
  assert.equal(new Set([...p1, ...p2]).size, PAGE_SIZE * 2);
  assert.deepEqual((await listProducts({ page: "999" }, true)).products, []); // past the end: empty, not clamped
  assert.equal((await listProducts({ page: "999" })).page, all.pages); // the home page clamps it
  const shoes = await listProducts({ category: "کفش", sort: "cheap" });
  assert.ok(shoes.products.every((p) => p.category === "کفش"));
  assert.deepEqual(shoes.products.map((p) => p.price), shoes.products.map((p) => p.price).toSorted((a, b) => a - b));
  const cheap = await listProducts({ max: String(shoes.products[1].price), category: "کفش" });
  assert.ok(cheap.products.length >= 2 && cheap.products.every((p) => p.price <= shoes.products[1].price));
  assert.ok((await listProducts({})).products.every((p) => p.variants.every((v) => v.product_id === p.id && v.stock > 0)));
});
test("two customers buying the last item at once: one order, never negative stock", async () => {
  const v = (await db.prepare("SELECT id FROM variants WHERE stock > 0 LIMIT 1").get()) as { id: number };
  await db.prepare("UPDATE variants SET stock = 1 WHERE id = ?").run(v.id);
  const results = await Promise.allSettled([placeOrder(user.id, { [v.id]: 1 }, info), placeOrder(user.id, { [v.id]: 1 }, info)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.match(failed.reason.message, /کافی نیست/);
  assert.equal(await stockOf(v.id), 0);
});

test("payment callback: verified once on the server, NOK and failures leave the order unpaid, late payments flagged", async () => {
  const { confirmPayment } = await import("../lib/zarinpal.ts");
  const realFetch = globalThis.fetch;
  let verifyCode = 100;
  let verifyCalls = 0;
  globalThis.fetch = (async () => {
    verifyCalls++;
    return new Response(JSON.stringify({ data: { code: verifyCode, ref_id: 777 }, errors: [] }));
  }) as typeof fetch;
  try {
    const v = (await db.prepare("SELECT id FROM variants WHERE stock >= 3 LIMIT 1").get()) as { id: number };
    const order = async (authority: string) => {
      const id = await placeOrder(user.id, { [v.id]: 1 }, info, "online");
      await db.prepare("UPDATE orders SET authority = ? WHERE id = ?").run(authority, id);
      return id;
    };
    const row = async (id: number) => (await db.prepare("SELECT status, ref_id FROM orders WHERE id = ?").get(id)) as { status: string; ref_id: string | null };

    assert.deepEqual(await confirmPayment("", "OK"), { error: "تراکنش پیدا نشد" });
    assert.deepEqual(await confirmPayment("A-unknown", "OK"), { error: "تراکنش پیدا نشد" });

    const nok = await order("A-nok");
    assert.match((await confirmPayment("A-nok", "NOK")).error, /پرداخت انجام نشد/);
    assert.equal(verifyCalls, 0, "a NOK return is never verified");
    assert.equal((await row(nok)).status, "awaiting_payment");

    const ok = await order("A-ok");
    assert.deepEqual(await confirmPayment("A-ok", "OK"), { orderId: ok, error: "", notify: "paid" });
    assert.deepEqual(await row(ok), { status: "pending", ref_id: "777" });
    verifyCode = 101;
    assert.deepEqual(await confirmPayment("A-ok", "OK"), { orderId: ok, error: "" }, "a repeated callback sends no second SMS");

    verifyCode = -51;
    const bad = await order("A-bad");
    assert.match((await confirmPayment("A-bad", "OK")).error, /تأیید نشد/);
    assert.equal((await row(bad)).status, "awaiting_payment");

    // The order expires while Zarinpal is verifying: the money is in, so the owner must refund it.
    verifyCode = 100;
    const late = await order("A-late");
    globalThis.fetch = (async () => {
      await cancelOrder(late);
      return new Response(JSON.stringify({ data: { code: 100, ref_id: 888 } }));
    }) as typeof fetch;
    const result = await confirmPayment("A-late", "OK");
    assert.equal(result.notify, "late_payment");
    assert.deepEqual(await row(late), { status: "cancelled", ref_id: "888" });
  } finally {
    globalThis.fetch = realFetch;
  }
});
