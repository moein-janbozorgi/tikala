// End-to-end test: drives the running site like a no-JS browser (reads $ACTION_ID_ fields from forms and posts them).
// It creates users and orders and makes a test account admin, so it only runs against a throwaway database.
// Usage (see README): start `next start -p 3123` with DB_PATH=<throwaway db>, ZARINPAL_SANDBOX=1, SMS_CONSOLE=1 and
// ADMIN_PHONE=09350000009, then
//   DB_PATH=<same db> npm run test:e2e
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
if (!process.env.DB_PATH || /data[\\/]shop\.db$/i.test(process.env.DB_PATH)) {
  console.error("Set DB_PATH to the throwaway database the test server uses (never data/shop.db).");
  process.exit(1);
}
const base = process.env.E2E_URL ?? "http://localhost:3123";
let cookies = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) {
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    cookies[k] = v;
  }
}
async function get(path) {
  const res = await fetch(base + path, { headers: { cookie: cookieHeader() }, redirect: "manual" });
  store(res);
  return { status: res.status, html: await res.text(), location: res.headers.get("location") };
}
async function submit(path, actionIndex, fields) {
  const { html } = await get(path);
  const ids = [...html.matchAll(/name="(\$ACTION_ID_[^"]+)"/g)].map((m) => m[1]);
  const form = new FormData();
  form.append(ids[actionIndex], "");
  for (const [k, v] of Object.entries(fields)) form.append(k, v instanceof Blob ? v : String(v));
  const res = await fetch(base + path, { method: "POST", body: form, headers: { cookie: cookieHeader(), origin: base }, redirect: "manual" });
  store(res);
  return { status: res.status, location: res.headers.get("location") };
}
/** Posts the first form on the page whose HTML contains `marker`, so tests don't depend on how many forms come before it. */
async function submitForm(path, marker, fields) {
  const { html } = await get(path);
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).filter((f) => f.includes("$ACTION_ID_"));
  const index = forms.findIndex((f) => f.includes(marker));
  if (index < 0) throw new Error(`no form containing ${marker} on ${path}`);
  return submit(path, index, fields);
}
// SMS: the server is started with SMS_CONSOLE=1, so codes and messages land in sms-outbox.log next to the database.
const outbox = () => { try { return readFileSync(join(dirname(process.env.DB_PATH), "sms-outbox.log"), "utf8"); } catch { return ""; } };
const latestCode = (phone) => [...outbox().matchAll(new RegExp(`\\t${phone}\\tکد ورود تیکالا: ([0-9]{5})`, "g"))].at(-1)?.[1];
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };

for (const p of ["/", "/product/1", "/cart", "/login", "/register"]) check((await get(p)).status === 200, `GET ${p} 200`);
check((await get("/product/999")).status === 404, "unknown product 404");
check((await get("/admin")).status !== 200, "admin blocked for guests");

const email = `e2e${Date.now()}@test.com`;
// guests: 0 = theme form, 1 = page form
let r = await submit("/register?next=/cart", 1, { name: "تست", email, password: "short", confirm: "short", next: "/cart" });
check(r.location?.includes("error="), "short password rejected (server)");
r = await submit("/register?next=/cart", 1, { name: "تست", email, password: "passwordonly", confirm: "passwordonly", next: "/cart" });
check(decodeURIComponent(r.location ?? "").includes("یک حرف و یک عدد"), "password without digit rejected");
r = await submit("/register?next=/cart", 1, { name: "تست", email, password: "password123", confirm: "password124", next: "/cart" });
check(decodeURIComponent(r.location ?? "").includes("یکسان نیستند"), "mismatched confirmation rejected");
r = await submit("/register?next=/cart", 1, { name: "تست", email, password: "short", confirm: "short", next: "/cart" });
check(r.location?.includes("error="), "short password rejected");
r = await submit("/register?next=/cart", 1, { name: "تست", email, password: "password123", confirm: "password123", next: "/cart" });
check(r.location === "/cart" && cookies.session, "register logs in and redirects to next");
r = await submit("/register", 2, { name: "x", email, password: "password123", confirm: "password123", next: "/" });
check(r.location?.includes("error="), "duplicate email rejected");

const productHtml = (await get("/product/1")).html;
const variantId = Number(productHtml.match(/name="variantId" checked="" value="(\d+)"/)[1]);
// index 0 = logout form in header, 1 = theme, 2 = add to cart
r = await submit("/product/1", 2, { variantId, qty: 999 });
check(r.location?.includes("error="), "over-stock add rejected");
r = await submit("/product/1", 2, { variantId, qty: 2 });
check(r.location === "/cart", "add to cart");
check((await get("/cart")).html.includes("ثبت سفارش"), "cart shows checkout form");

// cart page forms: 0 logout, 1 theme, 2 update, 3 remove, 4 checkout
r = await submitForm("/cart", 'name="postal_code"', { name: "تست", phone: "123", address: "x" });
check(r.location?.includes("error="), "bad phone rejected");
r = await submitForm("/cart", 'name="postal_code"', { name: "تست", phone: "09121234567", province: "تهران", city: "تهران", postal_code: "1234567890", address: "تهران، خیابان آزادی", payment: "cod" });
check(r.location?.startsWith("/account?order="), "checkout creates order");
const account = (await get("/account")).html;
check(account.includes("در انتظار بررسی"), "order visible in account");
check(Object.keys(JSON.parse(decodeURIComponent(cookies.cart || "%7B%7D"))).length === 0, "cart cleared");

check((await get("/admin")).status !== 200, "admin blocked for normal user");
// Admin access belongs to one mobile number. The test server runs with ADMIN_PHONE=09350000009; this account becomes
// admin by verifying that number with an SMS code, exactly as the shop owner does.
const adminPhone = "09350000009";
r = await submitForm("/account", 'value="link"', { purpose: "link", phone: adminPhone });
r = await submitForm(r.location, 'name="code"', { phone: adminPhone, next: "/", purpose: "link", code: latestCode(adminPhone) });
const admin = await get("/admin");
check(admin.status === 200 && admin.html.includes("تهران، خیابان آزادی"), "the admin phone's account gets the admin panel (server needs ADMIN_PHONE=09350000009)");
// admin page forms: 0 logout, 1 theme, 2 = status form of newest order
r = await submit("/admin", 2, { id: r.location.split("=")[1], status: "shipped" });
check(r.location === "/admin" && (await get("/account")).html.includes("ارسال شده"), "admin updates order status");
r = await submitForm("/admin/products/new", 'name="variants"', { name: "کلاه", price: 100000, category: "اکسسوری", image: "javascript:alert(1)", variants: "", active: "on" });
check(r.location?.includes("error="), "bad image url rejected");
r = await submitForm("/admin/products/new", 'name="variants"', { name: "کلاه بافتنی", price: 200000, category: "اکسسوری", image: "", variants: "Free | قرمز | 3", active: "on" });
check(r.location === "/admin/products" && (await get("/?category=" + encodeURIComponent("اکسسوری"))).html.includes("کلاه بافتنی"), "admin creates product, shown in category");

// --- Zarinpal sandbox: the StartPay page has plain OK / NOK links that redirect to our callback.
const product1Stock = async () => (await get("/admin/products")).html.match(/href="\/admin\/products\/1"[\s\S]*?موجودی (?:<!-- -->)?([۰-۹]+)/)[1];
async function onlineCheckout() {
  await submit("/product/1", 2, { variantId, qty: 1 });
  const res = await submitForm("/cart", 'name="postal_code"', { name: "تست", phone: "09121234567", province: "تهران", city: "تهران", postal_code: "1234567890", address: "آدرس آنلاین برای تست", payment: "online" });
  return res.location;
}
async function gatewayChoice(startPayUrl, status) {
  const page = await (await fetch(startPayUrl)).text();
  const link = page.match(new RegExp(`href="([^"]*status=${status})"`))[1].replace(/^http:/, "https:");
  const back = (await fetch(link, { redirect: "manual" })).headers.get("location");
  const res = await fetch(back, { headers: { cookie: cookieHeader() }, redirect: "manual" });
  return { back, location: res.headers.get("location") };
}

let gw = await onlineCheckout();
check(gw?.startsWith("https://sandbox.zarinpal.com/pg/StartPay/"), "online checkout redirects to Zarinpal sandbox");
let cb = await gatewayChoice(gw, "OK");
check(cb.back.startsWith(`${base}/payment/callback?`) && cb.back.includes("Status=OK"), "gateway returns to our callback");
check(cb.location?.includes("paid=1"), "successful payment verified");
let acct = (await get(cb.location)).html;
check(acct.includes("پرداخت با موفقیت انجام شد") && acct.includes("کد پیگیری"), "account shows paid order with reference id");
check((await fetch(cb.back, { redirect: "manual" })).headers.get("location")?.includes("paid=1"), "repeat callback is harmless");

const stockBefore = await product1Stock();
gw = await onlineCheckout();
cb = await gatewayChoice(gw, "NOK");
check(cb.location?.includes("error="), "cancelled payment reported as error");
acct = (await get("/account")).html;
check(acct.includes("در انتظار پرداخت") && acct.includes("پرداخت آنلاین</button>"), "unpaid order offers retry");
const unpaidId = cb.location.match(/order=(\d+)/)[1];
// account forms: 0 logout, 1 theme, 2 = pay button of newest (unpaid) order
r = await submit("/account", 2, { orderId: unpaidId });
check(r.location?.startsWith("https://sandbox.zarinpal.com/pg/StartPay/"), "retry payment goes to gateway");
r = await submit("/admin", 2, { id: unpaidId, status: "cancelled" });
const stockAfter = await product1Stock();
check(stockAfter === stockBefore, `admin cancel returns stock (${stockBefore} -> ${stockAfter})`);
const staleCb = await fetch(`${base}/payment/callback?Authority=${gw.split("/").pop()}&Status=OK`, { headers: { cookie: cookieHeader() }, redirect: "manual" });
check(staleCb.headers.get("location")?.includes("error="), "stale authority after retry is rejected");

// theme form cycles system -> light -> dark -> system
r = await submit("/", 1, { theme: "dark" });
check(/<html[^>]*data-theme="dark"/.test((await get("/")).html), "theme dark pinned");
r = await submit("/", 1, { theme: "system" });
check(!/<html[^>]*data-theme=/.test((await get("/")).html), "theme back to system");

// Buy straight from a home-page card: forms are 0 logout, 1 theme, then one per in-stock product card.
const home = (await get("/")).html;
check(home.includes('aria-label="افزایش تعداد"') && home.includes('aria-label="کاهش تعداد"') && home.includes(">خرید</button>"), "cards show stepper and buy button");
const cardVariant = home.match(/<select name="variantId"[^>]*><option value="(\d+)"/)[1];
r = await submit("/", 2, { variantId: cardVariant, qty: 3 });
const cartQty = (html) => html.match(new RegExp(`name="variantId" value="${cardVariant}"/>[\\s\\S]*?aria-label="تعداد"[^>]*>([۰-۹]+)<`))?.[1];
check(r.location === "/cart" && cartQty((await get("/cart")).html) === "۳", "card buy adds chosen quantity to cart");
// Cart stepper: each button posts the quantity it leads to (+ → 4), and at 1 the − becomes a trash button that posts 0.
let cartHtml = (await get("/cart")).html;
check(/<button value="4"[^>]*name="qty"/.test(cartHtml) && /<button value="2"[^>]*name="qty"/.test(cartHtml), "cart stepper buttons carry the next quantities");
r = await submitForm("/cart", `name="variantId" value="${cardVariant}"`, { variantId: cardVariant, qty: 4 });
check(r.location === "/cart" && cartQty((await get("/cart")).html) === "۴", "cart + raises the quantity");
r = await submitForm("/cart", `name="variantId" value="${cardVariant}"`, { variantId: cardVariant, qty: 1 });
cartHtml = (await get("/cart")).html;
check(cartQty(cartHtml) === "۱" && cartHtml.includes('aria-label="حذف از سبد خرید"'), "at 1 the − turns into a remove button");
r = await submitForm("/cart", `name="variantId" value="${cardVariant}"`, { variantId: cardVariant, qty: 0 });
check(!(await get("/cart")).html.includes(`name="variantId" value="${cardVariant}"`), "remove button takes the item out of the cart");

// Register form: name and email rules (logged in here, so forms are 0 logout, 1 theme, 2 register).
const reg = (fields) => submit("/register", 2, { password: "password123", confirm: "password123", next: "/", ...fields });
r = await reg({ name: "علی123", email: `n1${email}` });
check(decodeURIComponent(r.location ?? "").includes("نام باید"), "invalid name rejected");
r = await reg({ name: "علی رضایی", email: "bad@example" });
check(decodeURIComponent(r.location ?? "").includes("ایمیل معتبر نیست"), "invalid email rejected");
const newEmail = `N2${email}`.toUpperCase();
r = await reg({ name: "  مریم\u200cالسادات    احمدی ", email: newEmail });
check(r.location === "/", "valid Persian name with half-space registers");
const { DatabaseSync } = await import("node:sqlite");
const saved = new DatabaseSync(process.env.DB_PATH).prepare("SELECT name, email FROM users WHERE email = ?").get(newEmail.toLowerCase());
check(saved?.name === "مریم\u200cالسادات احمدی", "name saved with spaces collapsed, email lowercased");

// Persian 404 page and per-product titles.
check((await get("/product/999")).html.includes("صفحه پیدا نشد") && (await get("/no-such-page")).html.includes("صفحه پیدا نشد"), "Persian 404 page");
check((await get("/product/1")).html.includes("<title>تی‌شرت نخی ساده | تیکالا</title>"), "product page title has product name");

// Login lockout: 5 failures in 15 minutes, then locked (unknown emails count too). Logged in: 0 logout, 1 theme, 2 login.
const lockEmail = `lock${Date.now()}@test.com`;
for (let i = 0; i < 5; i++) r = await submitForm("/login", 'name="password"', { email: lockEmail, password: "wrong-password1", next: "/" });
check(decodeURIComponent(r.location ?? "").includes("اشتباه است"), "wrong password rejected");
r = await submitForm("/login", 'name="password"', { email: lockEmail, password: "wrong-password1", next: "/" });
check(decodeURIComponent(r.location ?? "").includes("تعداد تلاش بیش از حد"), "6th attempt is locked out");

// ---------- SMS ----------
await new Promise((r) => setTimeout(r, 300)); // notifications are sent just after the response
check(outbox().includes("ثبت شد") && outbox().includes("پرداخت سفارش") && outbox().includes("ارسال شد"), "order SMS: placed, paid and shipped messages sent");

// The register checks above left a new non-admin user signed in; switch back to the e2e admin.
r = await submitForm("/login", 'name="password"', { email, password: "password123", next: "/" });
check(r.location === "/", "signed back in as the e2e admin");

// ---------- Search and pagination ----------
const all = (await get("/")).html;
const cards = (html) => html.split('href="/product/').length - 1;
check(all.includes("نمایش محصولات بیشتر") && all.includes("?page=2") && cards(all) === 12, "home page shows 12 products and a load-more link");
check(/popovertarget="side-menu"/i.test(all) && all.includes('id="side-menu"') && all.includes("?category=" + encodeURIComponent("کفش")) && all.includes("کاپشن و ژاکت"), "side menu lists categories, including the new ones");
const bootsLink = "/?" + new URLSearchParams({ category: "کفش", type: "بوت" });
check(all.includes(`href="${bootsLink.replace("&", "&amp;")}"`) && all.includes(">کتانی<") && !all.includes("همه کفش"), "side menu lists each category's types, without an 'all' link");
const boots = (await get(bootsLink)).html;
check(cards(boots) === 1 && boots.includes("بوت چرم قهوه‌ای سوخته") && !boots.includes("نوع:") && !all.includes(" کالا<"), "type filter shows only that type; types and counts live only in the menu");
const page2 = (await get("/?page=2")).html;
check(cards(page2) === 24 && page2.includes("کالکشن فصل"), "?page=2 grows the list to 24, banner stays (infinite scroll)");
const found = (await get("/?q=" + encodeURIComponent("هودي"))).html; // Arabic ي on purpose
check(found.includes("هودی مشکی طرح جمجمه") && !found.includes("شلوار جین مشکی اسلیم") && found.includes("نتیجه برای"), "search finds hoodies (Arabic ي normalized)");
check((await get("/?q=" + encodeURIComponent("%"))).html.includes("محصولی یافت نشد"), "search treats % literally");

// ---------- Checkout: structured address, Persian digits, typed values kept after an error ----------
await submit("/product/1", 2, { variantId, qty: 1 });
r = await submitForm("/cart", 'name="postal_code"', { name: "تست", phone: "۰۹۱۲۱۲۳۴۵۶۷", province: "اصفهان", city: "کاشان", postal_code: "123", address: "خیابان امیرکبیر، کوچه ۵", payment: "cod" });
const cartAfterError = (await get("/cart")).html;
check(decodeURIComponent(r.location ?? "").includes("کد پستی") && cartAfterError.includes('value="کاشان"') && cartAfterError.includes("خیابان امیرکبیر، کوچه ۵"), "bad postal code rejected, typed address kept");
r = await submitForm("/cart", 'name="postal_code"', { name: "تست", phone: "۰۹۱۲۱۲۳۴۵۶۷", province: "اصفهان", city: "کاشان", postal_code: "۸۷۱۵۹-۹۹۹۹۹", address: "خیابان امیرکبیر، کوچه ۵", payment: "cod" });
check(r.location?.startsWith("/account?order="), "Persian-digit phone and postal code accepted");
check((await get("/account")).html.includes("کاشان") && (await get("/admin")).html.includes("8715999999"), "order stores province, city and postal code");

// ---------- Admin image upload (the e2e user is admin) ----------
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const product = { name: "کلاه زمستانی", price: 300000, category: "اکسسوری", image: "", variants: "Free | مشکی | 2", active: "on" };
r = await submitForm("/admin/products/new", 'name="imageFile"', { ...product, imageFile: new File(["<svg onload=alert(1)>"], "evil.png", { type: "image/png" }) });
check(decodeURIComponent(r.location ?? "").includes("فقط تصویر"), "upload of a non-image is refused");
r = await submitForm("/admin/products/new", 'name="imageFile"', { ...product, imageFile: new File([png], "hat.png", { type: "image/png" }) });
const uploaded = (await get("/admin/products")).html.match(/src="(\/uploads\/[0-9a-f-]{36}\.png)"/)?.[1];
const served = uploaded ? await fetch(base + uploaded) : null;
check(r.location === "/admin/products" && served?.status === 200 && served.headers.get("content-type") === "image/png", "uploaded PNG saved and served");
check((await fetch(base + "/uploads/..%2Fshop.db")).status === 404, "upload route refuses other files");

// ---------- Admin: categories, deleting products, order filters ----------
const err = (res) => decodeURIComponent(res.location ?? "");
r = await submitForm("/admin/categories", 'placeholder="مثلاً: کیف"', { name: "کیف" });
check(r.location === "/admin/categories?saved=1" && (await get("/admin/products/new")).html.includes("<option>کیف</option>"), "admin adds a category, offered in the product form");
r = await submitForm("/admin/categories", 'placeholder="مثلاً: کیف"', { name: "کیف" });
check(err(r).includes("از قبل وجود دارد"), "duplicate category rejected");
r = await submitForm("/admin/categories", 'name="from" value="کیف"', { from: "کیف", name: "کیف و کوله" });
const cats = (await get("/admin/categories")).html;
check(r.location === "/admin/categories?saved=1" && cats.includes("کیف و کوله") && !cats.includes('value="کیف"'), "admin renames a category");
r = await submitForm("/admin/categories", 'type="hidden" name="name" value="اکسسوری"', { name: "اکسسوری" });
check(err(r).includes("ابتدا محصولات"), "category with products can't be deleted");
r = await submitForm("/admin/categories", 'type="hidden" name="name" value="کیف و کوله"', { name: "کیف و کوله" });
check(r.location === "/admin/categories?saved=1" && !(await get("/admin/categories")).html.includes("کیف و کوله"), "empty category deleted");

const hatId = (await get("/admin/products?q=" + encodeURIComponent("کلاه بافتنی"))).html.match(/href="\/admin\/products\/(\d+)"/)[1];
r = await submitForm("/admin/products", `name="id" value="${hatId}"`, { id: hatId });
check(
  r.location === "/admin/products?deleted=1" && (await get(`/product/${hatId}`)).status === 404 && (await get(`/admin/products/${hatId}`)).status === 404,
  "admin deletes a product",
);

// Counts rendered cards only: the page also embeds React's data payload, which repeats the text.
const orderCards = (html) => html.split("سفارش #<!-- -->").length - 1;
check(orderCards((await get(`/admin?q=${unpaidId}`)).html) === 1, "admin finds an order by its number");
check(orderCards((await get(`/admin?status=cancelled&q=${unpaidId}`)).html) === 1 && orderCards((await get("/admin?status=delivered")).html) === 0, "admin filters orders by status");
check(orderCards((await get("/admin?q=" + encodeURIComponent("تست"))).html) > 0 && orderCards((await get("/admin?q=" + encodeURIComponent("ناشناس"))).html) === 0, "admin searches orders by customer name");

// ---------- Phone login, linking a phone, and "forgot password" ----------
const p1 = "09350000001";
r = await submitForm("/account", 'value="link"', { purpose: "link", phone: p1 });
check(r.location?.startsWith("/login/verify?"), "link phone: code requested");
r = await submitForm(r.location, 'name="code"', { phone: p1, next: "/", purpose: "link", code: latestCode(p1) });
check(r.location === "/account?phone=1", "phone linked to the email account");
check((await get("/admin")).status !== 200, "switching away from the admin number removes admin access");
await submitForm("/", "خروج", {});
check(!cookies.session, "logged out");

r = await submitForm("/login", 'value="login"', { purpose: "login", next: "/account", phone: "۰۹۳۵۰۰۰۰۰۰۱" });
r = await submitForm(r.location, 'name="code"', { phone: p1, next: "/account", purpose: "login", code: latestCode(p1) });
check(r.location === "/account" && (await get("/account")).html.includes("تغییر رمز عبور"), "phone code signs into the existing email account");
r = await submitForm("/account", 'name="confirm"', { password: "newpass123", confirm: "newpass123" });
check(r.location === "/account?password=1", "new password set from the account page");
await submitForm("/", "خروج", {});
r = await submitForm("/login", 'name="password"', { email, password: "newpass123", next: "/" });
check(r.location === "/" && cookies.session, "forgot-password flow: email login works with the new password");
await submitForm("/", "خروج", {});

const p2 = "09350000002";
r = await submitForm("/login", 'value="login"', { purpose: "login", next: "/", phone: p2 });
const verifyUrl = r.location;
r = await submitForm(verifyUrl, 'name="code"', { phone: p2, next: "/", purpose: "login", code: latestCode(p2) === "00000" ? "11111" : "00000" });
check(decodeURIComponent(r.location ?? "").includes("اشتباه"), "wrong SMS code rejected");
r = await submitForm(verifyUrl, 'name="code"', { phone: p2, next: "/", purpose: "login", code: latestCode(p2), name: "" });
check(decodeURIComponent(r.location ?? "").includes("نام را وارد کنید"), "new number needs a name");
r = await submitForm(verifyUrl, 'name="code"', { phone: p2, next: "/", purpose: "login", code: latestCode(p2), name: "کاربر موبایلی" });
check(r.location === "/" && (await get("/")).html.includes("کاربر موبایلی"), "new phone-only account created and signed in");
await submitForm("/", "خروج", {});
r = await submitForm("/login", 'value="login"', { purpose: "login", next: "/", phone: p2 });
r = await submitForm("/login", 'value="login"', { purpose: "login", next: "/", phone: p2 });
check(decodeURIComponent(r.location ?? "").includes("صبر کنید"), "resending a code needs a 1-minute wait");
