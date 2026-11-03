// End-to-end test: drives the running site like a no-JS browser (reads $ACTION_ID_ fields from forms and posts them).
// It creates users and orders and promotes a test account to admin, so it only runs against a throwaway database.
// Usage (see README): start `next start -p 3123` with DB_PATH=<throwaway db> and ZARINPAL_SANDBOX=1, then
//   DB_PATH=<same db> npm run test:e2e
import { execSync } from "node:child_process";
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
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const res = await fetch(base + path, { method: "POST", body: form, headers: { cookie: cookieHeader(), origin: base }, redirect: "manual" });
  store(res);
  return { status: res.status, location: res.headers.get("location") };
}
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
r = await submit("/cart", 4, { name: "تست", phone: "123", address: "x" });
check(r.location?.includes("error="), "bad phone rejected");
r = await submit("/cart", 4, { name: "تست", phone: "09121234567", address: "تهران، خیابان آزادی", payment: "cod" });
check(r.location?.startsWith("/account?order="), "checkout creates order");
const account = (await get("/account")).html;
check(account.includes("در انتظار بررسی"), "order visible in account");
check(Object.keys(JSON.parse(decodeURIComponent(cookies.cart || "%7B%7D"))).length === 0, "cart cleared");

check((await get("/admin")).status !== 200, "admin blocked for normal user");
execSync(`npm run make-admin -- ${email}`, { cwd: process.cwd(), env: process.env, stdio: "ignore" });
const admin = await get("/admin");
check(admin.status === 200 && admin.html.includes("تهران، خیابان آزادی"), "admin sees order after make-admin");
// admin page forms: 0 logout, 1 theme, 2 = status form of newest order
r = await submit("/admin", 2, { id: r.location.split("=")[1], status: "shipped" });
check(r.location === "/admin" && (await get("/account")).html.includes("ارسال شده"), "admin updates order status");
r = await submit("/admin/products", 2, { name: "کلاه", price: 100000, category: "اکسسوری", image: "javascript:alert(1)", variants: "", active: "on" });
check(r.location?.includes("error="), "bad image url rejected");
r = await submit("/admin/products", 2, { name: "کلاه بافتنی", price: 200000, category: "اکسسوری", image: "", variants: "Free | قرمز | 3", active: "on" });
check(r.location === "/admin/products" && (await get("/?category=" + encodeURIComponent("اکسسوری"))).html.includes("کلاه بافتنی"), "admin creates product, shown in category");

// --- Zarinpal sandbox: the StartPay page has plain OK / NOK links that redirect to our callback.
const product1Stock = async () => (await get("/admin/products")).html.match(/href="\/admin\/products\/1"[\s\S]*?موجودی (?:<!-- -->)?([۰-۹]+)/)[1];
async function onlineCheckout() {
  await submit("/product/1", 2, { variantId, qty: 1 });
  const res = await submit("/cart", 4, { name: "تست", phone: "09121234567", address: "آدرس آنلاین", payment: "online" });
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
check(r.location === "/cart" && (await get("/cart")).html.includes(`value="${cardVariant}"`) && /name="qty"[^>]*value="3"/.test((await get("/cart")).html), "card buy adds chosen quantity to cart");

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
check((await get("/product/1")).html.includes("<title>تی‌شرت نخی ساده | فروشگاه پوشاک</title>"), "product page title has product name");

// Login lockout: 5 failures in 15 minutes, then locked (unknown emails count too). Logged in: 0 logout, 1 theme, 2 login.
const lockEmail = `lock${Date.now()}@test.com`;
for (let i = 0; i < 5; i++) r = await submit("/login", 2, { email: lockEmail, password: "wrong-password1", next: "/" });
check(decodeURIComponent(r.location ?? "").includes("اشتباه است"), "wrong password rejected");
r = await submit("/login", 2, { email: lockEmail, password: "wrong-password1", next: "/" });
check(decodeURIComponent(r.location ?? "").includes("تعداد تلاش بیش از حد"), "6th attempt is locked out");
