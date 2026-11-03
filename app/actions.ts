"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, placeOrder, type CheckoutInfo } from "@/lib/db";
import { startPayment } from "@/lib/zarinpal";
import { endSession, requireUser, safeNext, startSession } from "@/lib/auth";
import { getCart, setCart } from "@/lib/cart";
import { clearFlash, setFlash } from "@/lib/flash";
import { PROVINCES } from "@/lib/format";
import { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } from "@/lib/password";
import { checkCode, consumeCode, createCode } from "@/lib/otp";
import { notifyOrder, sendLoginCode } from "@/lib/sms";
import { emailProblem, nameProblem, normalizePhone, normalizePostalCode, toLatinDigits } from "@/lib/validation";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);

export async function addToCart(form: FormData) {
  const variantId = Number(form.get("variantId"));
  const qty = Math.max(1, Math.floor(Number(form.get("qty"))) || 1);
  const variant = db.prepare("SELECT product_id, stock FROM variants WHERE id = ?").get(variantId) as
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
  const qty = Math.floor(Number(form.get("qty"))) || 0;
  const cart = await getCart();
  if (qty > 0) cart[variantId] = qty;
  else delete cart[variantId];
  await setCart(cart);
  redirect("/cart");
}

/** Like fail(), but first saves what the user typed so the form comes back filled in. */
async function failWithValues(path: string, message: string, form: string, values: Record<string, string>): Promise<never> {
  await setFlash(form, values);
  return fail(path, message);
}

export async function checkout(form: FormData) {
  const user = await requireUser("/cart");
  const typed = Object.fromEntries(["name", "phone", "province", "city", "postal_code", "address", "payment"].map((k) => [k, str(form, k)]));
  const reject = (message: string) => failWithValues("/cart", message, "checkout", typed);
  const phone = normalizePhone(typed.phone);
  const postalCode = normalizePostalCode(typed.postal_code);
  const nameError = nameProblem(typed.name.replace(/\s+/g, " "));
  if (nameError) await reject(`نام گیرنده: ${nameError}`);
  if (!phone) await reject("شماره موبایل معتبر نیست (مثال: 09121234567)");
  if (!PROVINCES.includes(typed.province)) await reject("استان را انتخاب کنید");
  if (typed.city.length < 2 || typed.city.length > 40) await reject("نام شهر را وارد کنید");
  if (!postalCode) await reject("کد پستی باید ۱۰ رقم باشد");
  if (typed.address.length < 10 || typed.address.length > 300) await reject("آدرس کامل را وارد کنید (۱۰ تا ۳۰۰ کاراکتر)");

  const info = { ...typed, name: typed.name.replace(/\s+/g, " "), phone: phone!, postal_code: postalCode! } as CheckoutInfo;
  const payment = typed.payment === "cod" ? "cod" : "online";

  let orderId = 0;
  try {
    orderId = placeOrder(user.id, await getCart(), info, payment);
  } catch (e) {
    await reject(e instanceof Error ? e.message : "خطا در ثبت سفارش");
  }
  await setCart({});
  await clearFlash();
  if (payment === "online") await goToGateway(orderId); // its SMS goes out once the payment is verified
  after(() => notifyOrder(orderId, "placed"));
  redirect(`/account?order=${orderId}`);
}

/** Retry button for an online order whose payment failed or was abandoned. */
export async function payOrder(form: FormData) {
  const user = await requireUser("/account");
  const orderId = Number(form.get("orderId"));
  // Only the owner may pay; startPayment checks the order is still awaiting payment.
  if (!db.prepare("SELECT 1 FROM orders WHERE id = ? AND user_id = ?").get(orderId, user.id)) fail("/account", "سفارش پیدا نشد");
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

export async function register(form: FormData) {
  const next = safeNext(form.get("next"));
  const back = `/register?next=${encodeURIComponent(next)}`;
  const name = str(form, "name").replace(/\s+/g, " ");
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  // Name and email come back after an error; passwords never do.
  const reject = (message: string) => failWithValues(back, message, "register", { name: str(form, "name"), email: str(form, "email") });
  const problem = nameProblem(name) ?? emailProblem(email) ?? passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) await reject(problem);
  const taken = "این ایمیل قبلاً ثبت شده است";
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) await reject(taken);

  let userId = 0;
  try {
    userId = (db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id").get(name, email, await hashPassword(password)) as { id: number }).id;
  } catch {
    // Two sign-ups with the same email at once: the UNIQUE constraint catches the one the check above missed.
    await reject(taken);
  }
  await clearFlash();
  await startSession(userId);
  redirect(next);
}

export async function login(form: FormData) {
  const next = safeNext(form.get("next"));
  const back = `/login?next=${encodeURIComponent(next)}`;
  const email = str(form, "email").toLowerCase();
  // Checked before the password, and unknown emails count too, so the lock reveals nothing about which accounts exist.
  if (loginLocked(email)) fail(back, "تعداد تلاش بیش از حد مجاز است؛ ۱۵ دقیقه دیگر دوباره تلاش کنید");
  const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string | null }
    | undefined;
  // Accounts created by phone have no password until the owner sets one in their account page.
  if (!user?.password_hash || !(await verifyPassword(String(form.get("password") ?? ""), user.password_hash))) {
    recordLoginFailure(email);
    fail(back, "ایمیل یا رمز عبور اشتباه است");
  }
  clearLoginFailures(email);
  await startSession(user!.id);
  redirect(next);
}

// Phone login: requestCode texts a code, verifyCode signs in (creating an account for a new number). With
// purpose=link, a signed-in user adds a phone to their account instead, which is what makes "forgot password" work.
const purposeOf = (form: FormData) => (form.get("purpose") === "link" ? "link" : "login");

export async function requestCode(form: FormData) {
  const purpose = purposeOf(form);
  const next = safeNext(form.get("next"));
  const back = purpose === "link" ? "/account" : `/login?next=${encodeURIComponent(next)}`;
  if (purpose === "link") await requireUser("/account");
  const phone = normalizePhone(str(form, "phone"));
  if (!phone) fail(back, "شماره موبایل معتبر نیست (مثال: 09121234567)");
  if (purpose === "link" && db.prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) fail(back, "این شماره برای حساب دیگری ثبت شده است");

  let error = "";
  try {
    await sendLoginCode(phone!, createCode(phone!));
  } catch (e) {
    error = e instanceof Error ? e.message : "ارسال کد ناموفق بود";
  }
  if (error) fail(back, error);
  redirect(`/login/verify?${new URLSearchParams({ phone: phone!, next, purpose })}`);
}

export async function verifyCode(form: FormData) {
  const purpose = purposeOf(form);
  const next = safeNext(form.get("next"));
  const phone = normalizePhone(str(form, "phone"));
  if (!phone) fail("/login", "شماره موبایل معتبر نیست");
  const back = `/login/verify?${new URLSearchParams({ phone: phone!, next, purpose })}`;
  const codeError = checkCode(phone!, toLatinDigits(str(form, "code")));
  if (codeError) fail(back, codeError);

  if (purpose === "link") {
    const user = await requireUser("/account");
    let taken = false;
    try {
      db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, user.id);
    } catch {
      taken = true; // UNIQUE: someone else verified this number in the meantime
    }
    consumeCode(phone!);
    redirect(taken ? `/account?error=${encodeURIComponent("این شماره برای حساب دیگری ثبت شده است")}` : "/account?phone=1");
  }

  let user = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone) as { id: number } | undefined;
  if (!user) {
    // New number: the code was right, but it stays valid until the name is fixed, so a typo doesn't cost a new SMS.
    const name = str(form, "name").replace(/\s+/g, " ");
    const nameError = nameProblem(name);
    if (nameError) fail(back, `برای ساخت حساب جدید نام را وارد کنید: ${nameError}`);
    user = db.prepare("INSERT INTO users (name, phone) VALUES (?, ?) ON CONFLICT (phone) DO UPDATE SET phone = phone RETURNING id").get(name, phone) as { id: number };
  }
  consumeCode(phone!);
  await startSession(user.id);
  redirect(next);
}

/** Sets a new password from the account page. A user who forgot theirs signs in by phone code first. */
export async function setPassword(form: FormData) {
  const user = await requireUser("/account");
  if (!user.email) fail("/account", "برای ورود با رمز عبور، حساب باید ایمیل داشته باشد");
  const problem = passwordProblem(String(form.get("password") ?? ""), String(form.get("confirm") ?? ""));
  if (problem) fail("/account", problem);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(String(form.get("password"))), user.id);
  clearLoginFailures(user.email!);
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
