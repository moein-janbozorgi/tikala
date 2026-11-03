"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, placeOrder } from "@/lib/db";
import { startPayment } from "@/lib/zarinpal";
import { endSession, requireUser, safeNext, startSession } from "@/lib/auth";
import { getCart, setCart } from "@/lib/cart";
import { clearLoginFailures, hashPassword, loginLocked, passwordProblem, recordLoginFailure, verifyPassword } from "@/lib/password";
import { emailProblem, nameProblem } from "@/lib/validation";

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

export async function checkout(form: FormData) {
  const user = await requireUser("/cart");
  const info = { name: str(form, "name"), phone: str(form, "phone"), address: str(form, "address") };
  if (!info.name || !info.address) fail("/cart", "نام و آدرس را وارد کنید");
  if (!/^0?9\d{9}$/.test(info.phone)) fail("/cart", "شماره موبایل معتبر نیست (مثال: 09121234567)");

  const payment = form.get("payment") === "cod" ? "cod" : "online";

  let orderId = 0;
  try {
    orderId = placeOrder(user.id, await getCart(), info, payment);
  } catch (e) {
    fail("/cart", e instanceof Error ? e.message : "خطا در ثبت سفارش");
  }
  await setCart({});
  if (payment === "online") await goToGateway(orderId);
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
  const problem = nameProblem(name) ?? emailProblem(email) ?? passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) fail(back, problem);
  const taken = "این ایمیل قبلاً ثبت شده است";
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) fail(back, taken);

  let userId = 0;
  try {
    userId = (db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id").get(name, email, await hashPassword(password)) as { id: number }).id;
  } catch {
    // Two sign-ups with the same email at once: the UNIQUE constraint catches the one the check above missed.
    fail(back, taken);
  }
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
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !(await verifyPassword(String(form.get("password") ?? ""), user.password_hash))) {
    recordLoginFailure(email);
    fail(back, "ایمیل یا رمز عبور اشتباه است");
  }
  clearLoginFailures(email);
  await startSession(user!.id);
  redirect(next);
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
