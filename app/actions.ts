"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cancelOrder, couponDiscount, db, placeOrder, transaction, type CheckoutInfo } from "@/lib/db";
import { startPayment } from "@/lib/zarinpal";
import { endOtherSessions, endSession, getUser, requireUser, startSession } from "@/lib/auth";
import { getCart, getCartLines, getCouponCode, setCart, setCouponCode } from "@/lib/cart";
import { clearFlash, setFlash } from "@/lib/flash";
import { PROVINCES } from "@/lib/format";
import { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } from "@/lib/password";
import { checkCode, consumeCode, createCode, smsAllowedForIp } from "@/lib/otp";
import { notifyOrder, sendLoginCode } from "@/lib/sms";
import { emailProblem, errorParam, nameProblem, normalizeCoupon, normalizePhone, normalizePostalCode, safeNext, toLatinDigits } from "@/lib/validation";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const fail = (path: string, message: string, key = "error"): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${errorParam(message)}`);
/** The page the login modal was open over (sent as `from`), with the modal's params added. */
const authUrl = (from: string, params: Record<string, string>) => `${from}${from.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`;
// The modal has its own error param, so the page under it doesn't show the same message.
const authFail = (path: string, message: string) => fail(path, message, "auth_error");

/** Adds a variant to the cart: by "variantId" (product cards), or by "productId" + "size" + "color" (the product page's two pickers). */
export async function addToCart(form: FormData) {
  const productId = Number(form.get("productId"));
  let variantId = Number(form.get("variantId"));
  if (productId) {
    const row = (await db.prepare("SELECT id FROM variants WHERE product_id = ? AND size = ? AND color = ?").get(productId, str(form, "size"), str(form, "color"))) as
      | { id: number }
      | undefined;
    if (!row) fail(`/product/${productId}`, "این سایز در این رنگ موجود نیست");
    variantId = row!.id;
  }
  const qty = Math.max(1, Math.floor(Number(form.get("qty"))) || 1);
  const variant = (await db.prepare("SELECT v.product_id, v.stock FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.active = 1").get(variantId)) as
    | { product_id: number; stock: number }
    | undefined;
  if (!variant) fail("/", "این کالا پیدا نشد");
  const cart = await getCart();
  const wanted = (cart[variantId] ?? 0) + qty;
  if (wanted > variant!.stock) fail(`/product/${variant!.product_id}`, "موجودی کافی نیست");
  await setCart({ ...cart, [variantId]: wanted });
  redirect("/cart");
}

export async function updateCartItem(form: FormData) {
  const variantId = String(Number(form.get("variantId")));
  // Never more than is in stock, and only real variants: anything else would just grow the cart cookie.
  const stock = ((await db.prepare("SELECT stock FROM variants WHERE id = ?").get(Number(variantId))) as { stock: number } | undefined)?.stock ?? 0;
  const qty = Math.min(stock, Math.floor(Number(form.get("qty"))) || 0);
  const cart = await getCart();
  if (qty > 0) cart[variantId] = qty;
  else delete cart[variantId];
  await setCart(cart);
  redirect("/cart");
}

/** The visitor's IP. Runs behind Nginx, whose $proxy_add_x_forwarded_for appends the real client IP last; earlier entries can be forged. */
const clientIp = async () => (await headers()).get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
const LOCKED = "تعداد تلاش بیش از حد مجاز است؛ ۱۵ دقیقه دیگر دوباره تلاش کنید";

/** Like fail(), but first saves what the user typed so the form comes back filled in. */
async function failWithValues(path: string, message: string, form: string, values: Record<string, string>, key?: string): Promise<never> {
  await setFlash(form, values);
  return fail(path, message, key);
}

export async function checkout(form: FormData) {
  const user = await requireUser("/cart");
  const typed = Object.fromEntries(["name", "phone", "province", "city", "postal_code", "address", "payment"].map((k) => [k, str(form, k)]));
  // The refill copy is cut to the longest valid value, so a huge field can't overflow the 4 KB flash cookie.
  const reject = (message: string) =>
    failWithValues("/cart", message, "checkout", Object.fromEntries(Object.entries(typed).map(([k, v]) => [k, v.slice(0, 300)])));
  const phone = normalizePhone(typed.phone);
  const postalCode = normalizePostalCode(typed.postal_code);
  const nameError = nameProblem(typed.name.replace(/\s+/g, " "));
  if (nameError) await reject(`نام گیرنده: ${nameError}`);
  if (!phone) await reject("شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)");
  if (!PROVINCES.includes(typed.province)) await reject("استان را انتخاب کنید");
  if (typed.city.length < 2 || typed.city.length > 40) await reject("نام شهر را وارد کنید");
  if (!postalCode) await reject("کد پستی باید ۱۰ رقم باشد");
  if (typed.address.length < 10 || typed.address.length > 300) await reject("آدرس کامل را وارد کنید (۱۰ تا ۳۰۰ کاراکتر)");

  const info = { ...typed, name: typed.name.replace(/\s+/g, " "), phone: phone!, postal_code: postalCode! } as CheckoutInfo;
  const payment = typed.payment === "cod" ? "cod" : "online";

  let orderId = 0;
  try {
    orderId = await placeOrder(user.id, await getCart(), info, payment, await getCouponCode());
  } catch (e) {
    await reject(e instanceof Error ? e.message : "خطا در ثبت سفارش");
  }
  await setCart({});
  await setCouponCode("");
  await clearFlash();
  if (payment === "online") await goToGateway(orderId); // its SMS goes out once the payment is verified
  after(() => notifyOrder(orderId, "placed"));
  redirect(`/account?order=${orderId}`);
}

/** Applies (or with the "remove" button, removes) a discount code in the cart, after checking it against the cart. */
export async function applyCoupon(form: FormData) {
  const code = form.has("remove") ? "" : normalizeCoupon(form.get("code"));
  if (code) {
    const subtotal = (await getCartLines()).reduce((sum, l) => sum + l.price * l.qty, 0);
    const result = await couponDiscount(code, subtotal);
    if ("error" in result) fail("/cart", result.error);
  }
  await setCouponCode(code);
  redirect("/cart");
}

/** The customer cancels their own order while nobody has acted on it yet; its items go back in stock. */
export async function cancelMyOrder(form: FormData) {
  const user = await requireUser("/account");
  const orderId = Number(form.get("orderId"));
  let problem = "";
  await transaction(async () => {
    const order = (await db.prepare("SELECT status, payment FROM orders WHERE id = ? AND user_id = ?").get(orderId, user.id)) as
      | { status: string; payment: string }
      | undefined;
    // Checked inside the transaction, so the admin can't start processing it in between.
    if (!order) problem = "سفارش پیدا نشد";
    // A paid online order would need a refund, which only the shop can do.
    else if (order.status === "pending" && order.payment === "online") problem = "سفارش پرداخت‌شده را فقط فروشگاه می‌تواند لغو کند؛ با پشتیبانی تماس بگیرید";
    else if (order.status !== "pending" && order.status !== "awaiting_payment") problem = "این سفارش دیگر قابل لغو نیست";
    else await cancelOrder(orderId);
  });
  if (problem) fail("/account", problem);
  redirect("/account?cancelled=1");
}

/** Retry button for an online order whose payment failed or was abandoned. */
export async function payOrder(form: FormData) {
  const user = await requireUser("/account");
  const orderId = Number(form.get("orderId"));
  // Only the owner may pay; startPayment checks the order is still awaiting payment.
  if (!await db.prepare("SELECT 1 FROM orders WHERE id = ? AND user_id = ?").get(orderId, user.id)) fail("/account", "سفارش پیدا نشد");
  await goToGateway(orderId);
}

async function goToGateway(orderId: number) {
  let url = "";
  try {
    url = await startPayment(orderId, (await headers()).get("origin") ?? "");
  } catch (e) {
    fail(`/account?order=${orderId}`, e instanceof Error ? e.message : "خطا در اتصال به درگاه پرداخت");
  }
  redirect(url);
}

/** Login and sign-up are for signed-out visitors; the modal isn't shown to others, this stops a form posted anyway. */
async function refuseIfSignedIn() {
  if (await getUser()) redirect("/");
}

export async function register(form: FormData) {
  await refuseIfSignedIn();
  const next = safeNext(form.get("next"));
  const back = authUrl(safeNext(form.get("from")), { auth: "register", next });
  const name = str(form, "name").replace(/\s+/g, " ");
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  // Name and email come back after an error; passwords never do.
  const reject = (message: string) =>
    failWithValues(back, message, "register", { name: str(form, "name").slice(0, 50), email: str(form, "email").slice(0, 254) }, "auth_error");
  const problem = nameProblem(name) ?? emailProblem(email) ?? passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) await reject(problem);
  // "Already registered" tells whether an email has an account, so trying taken emails counts like a failed login:
  // one IP can't check more than a handful of emails.
  const ip = await clientIp();
  if (await loginLocked(email, ip)) await reject(LOCKED);
  const taken = "این ایمیل قبلاً ثبت شده است";
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    await recordLoginFailure(email, ip);
    await reject(taken);
  }

  let userId = 0;
  try {
    userId = ((await db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id").get(name, email, await hashPassword(password))) as { id: number }).id;
  } catch {
    // Two sign-ups with the same email at once: the UNIQUE constraint catches the one the check above missed.
    await reject(taken);
  }
  await clearFlash();
  await startSession(userId);
  redirect(next);
}

export async function login(form: FormData) {
  await refuseIfSignedIn();
  const next = safeNext(form.get("next"));
  const back = authUrl(safeNext(form.get("from")), { auth: "login", next });
  // No account has a longer email or password (register and setPassword enforce it), and the cut keeps a multi-MB
  // value from being hashed or kept as a lockout key.
  const email = str(form, "email").toLowerCase().slice(0, 255);
  const password = String(form.get("password") ?? "");
  // Checked before the password, and unknown emails count too, so the lock reveals nothing about which accounts exist.
  const ip = await clientIp();
  if (await loginLocked(email, ip)) authFail(back, LOCKED);
  const user = (await db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email)) as
    | { id: number; password_hash: string | null }
    | undefined;
  // Accounts created by phone have no password until the owner sets one in their account page.
  if (!user?.password_hash || password.length > 64 || !(await verifyPassword(password, user.password_hash))) {
    await recordLoginFailure(email, ip);
    authFail(back, "ایمیل یا رمز عبور اشتباه است");
  }
  await clearLoginFailures(email);
  await startSession(user!.id);
  redirect(next);
}

// Phone login: requestCode texts a code, verifyCode signs in (creating an account for a new number). With
// purpose=link, a signed-in user adds a phone to their account instead, which is what makes "forgot password" work.
const purposeOf = (form: FormData) => (form.get("purpose") === "link" ? "link" : "login");

export async function requestCode(form: FormData) {
  const purpose = purposeOf(form);
  const next = safeNext(form.get("next"));
  // Linking starts from the account page's own form; login from the modal, over whatever page it was opened on.
  const from = purpose === "link" ? "/account" : safeNext(form.get("from"));
  if (purpose === "link") await requireUser("/account");
  else await refuseIfSignedIn();
  // Linking reports errors on the account page itself; login in the modal.
  const reject = (message: string) => (purpose === "link" ? fail(from, message) : authFail(authUrl(from, { auth: "login", next }), message));
  const phone = normalizePhone(str(form, "phone"));
  if (!phone) reject("شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)");
  if (purpose === "link" && await db.prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) reject("این شماره برای حساب دیگری ثبت شده است");
  if (!await smsAllowedForIp(await clientIp())) reject("تعداد درخواست کد از این دستگاه بیش از حد مجاز است؛ یک ساعت دیگر تلاش کنید");

  let error = "";
  try {
    const code = await createCode(phone!);
    // No real SMS (dev / SMS_CONSOLE=1): hand the code to the verify modal to show on screen.
    if (await sendLoginCode(phone!, code)) await setFlash("otp", { phone: phone!, code });
  } catch (e) {
    error = e instanceof Error ? e.message : "ارسال کد ناموفق بود";
  }
  if (error) reject(error);
  redirect(authUrl(from, { auth: "verify", mobile: phone!, next, purpose }));
}

export async function verifyCode(form: FormData) {
  const purpose = purposeOf(form);
  if (purpose === "login") await refuseIfSignedIn();
  const next = safeNext(form.get("next"));
  const from = purpose === "link" ? "/account" : safeNext(form.get("from"));
  const phone = normalizePhone(str(form, "phone"));
  if (!phone) authFail(authUrl(from, { auth: "login", next }), "شماره موبایل معتبر نیست");
  const back = authUrl(from, { auth: "verify", mobile: phone!, next, purpose });
  const codeError = await checkCode(phone!, toLatinDigits(str(form, "code")));
  if (codeError) authFail(back, codeError);

  if (purpose === "link") {
    const user = await requireUser("/account");
    let taken = false;
    try {
      await db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, user.id);
    } catch {
      taken = true; // UNIQUE: someone else verified this number in the meantime
    }
    await consumeCode(phone!);
    redirect(taken ? `/account?error=${errorParam("این شماره برای حساب دیگری ثبت شده است")}` : "/account?phone=1");
  }

  let user = (await db.prepare("SELECT id FROM users WHERE phone = ?").get(phone)) as { id: number } | undefined;
  if (!user) {
    // New number: the code was right, but it stays valid until the name is fixed, so a typo doesn't cost a new SMS.
    const name = str(form, "name").replace(/\s+/g, " ");
    const nameError = nameProblem(name);
    if (nameError) authFail(back, `برای ساخت حساب جدید نام را وارد کنید: ${nameError}`);
    user = (await db.prepare("INSERT INTO users (name, phone) VALUES (?, ?) ON CONFLICT (phone) DO UPDATE SET phone = phone RETURNING id").get(name, phone)) as { id: number };
  }
  await consumeCode(phone!);
  await startSession(user.id);
  redirect(next);
}

/** Sets a new password from the account page. A user who forgot theirs signs in by phone code first. */
export async function setPassword(form: FormData) {
  const user = await requireUser("/account");
  if (!user.email) fail("/account", "برای ورود با رمز عبور، حساب باید ایمیل داشته باشد");
  const problem = passwordProblem(String(form.get("password") ?? ""), String(form.get("confirm") ?? ""));
  if (problem) fail("/account", problem);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(String(form.get("password"))), user.id);
  await endOtherSessions(user.id);
  await clearLoginFailures(user.email!);
  redirect("/account?password=1");
}

/** "light" or "dark" pins the theme; anything else follows the OS. */
export async function setTheme(form: FormData) {
  const theme = form.get("theme");
  const store = await cookies();
  if (theme === "light" || theme === "dark") store.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else store.delete("theme");
}

export async function logout() {
  await endSession();
  redirect("/");
}
