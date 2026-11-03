"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyOrder } from "@/lib/sms";
import { cancelOrder, db, purgeOrder, saveVariants, transaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/format";
import { saveUpload } from "@/lib/uploads";
import { errorParam } from "@/lib/validation";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim().replace(/\s+/g, " ");
const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${errorParam(message)}`);

export async function saveProduct(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")) || 0;
  const name = text(form, "name");
  const price = Math.floor(Number(form.get("price")));
  const category = text(form, "category");
  let image = String(form.get("image") ?? "").trim();
  const back = id ? `/admin/products/${id}` : "/admin/products/new";
  if (!name || !(price > 0)) fail(back, "نام و قیمت معتبر وارد کنید");
  if (image && !/^(https?:\/\/|\/)/.test(image)) fail(back, "آدرس تصویر معتبر نیست");
  // An uploaded file wins over the URL field.
  const file = form.get("imageFile");
  if (file instanceof File && file.size > 0) {
    let uploadError = "";
    try {
      image = await saveUpload(file);
    } catch (e) {
      uploadError = e instanceof Error ? e.message : "خطا در بارگذاری تصویر";
    }
    if (uploadError) fail(back, uploadError);
  }

  const values = [name, String(form.get("description") ?? "").trim(), category, text(form, "subcategory"), price, image, form.get("active") ? 1 : 0];
  transaction(() => {
    const productId = id
      ? (db.prepare("UPDATE products SET name=?, description=?, category=?, subcategory=?, price=?, image=?, active=? WHERE id=?").run(...values, id), id)
      : (db.prepare("INSERT INTO products (name, description, category, subcategory, price, image, active) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id").get(...values) as { id: number }).id;
    saveVariants(productId, String(form.get("variants") ?? ""));
    if (category) db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(category);
  });
  redirect("/admin/products");
}

/** Deletes a product and its variants. Past orders keep their own copy of the name, size, color and price. */
export async function deleteProduct(form: FormData) {
  await requireAdmin();
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(form.get("id")));
  redirect("/admin/products?deleted=1");
}

const categoryProblem = (name: string) => (name.length < 2 || name.length > 40 ? "نام دسته‌بندی باید ۲ تا ۴۰ کاراکتر باشد" : null);

export async function addCategory(form: FormData) {
  await requireAdmin();
  const name = text(form, "name");
  const problem = categoryProblem(name);
  if (problem) fail("/admin/categories", problem);
  if (!db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(name).changes) fail("/admin/categories", "این دسته‌بندی از قبل وجود دارد");
  redirect("/admin/categories?saved=1");
}

/** Renames a category everywhere: the shop's menu, filters and every product in it follow. */
export async function renameCategory(form: FormData) {
  await requireAdmin();
  const from = text(form, "from");
  const to = text(form, "name");
  const problem = categoryProblem(to);
  if (problem) fail("/admin/categories", problem);
  if (to === from) redirect("/admin/categories");
  if (db.prepare("SELECT 1 FROM categories WHERE name = ?").get(to)) fail("/admin/categories", "دسته‌بندی دیگری با این نام وجود دارد");
  transaction(() => {
    db.prepare("UPDATE categories SET name = ? WHERE name = ?").run(to, from);
    db.prepare("UPDATE products SET category = ? WHERE category = ?").run(to, from);
  });
  redirect("/admin/categories?saved=1");
}

/** Only empty categories can be deleted, so no product is left without one by accident. */
export async function deleteCategory(form: FormData) {
  await requireAdmin();
  const name = text(form, "name");
  if (db.prepare("SELECT 1 FROM products WHERE category = ?").get(name)) fail("/admin/categories", "ابتدا محصولات این دسته‌بندی را حذف کنید یا به دسته دیگری ببرید");
  db.prepare("DELETE FROM categories WHERE name = ?").run(name);
  redirect("/admin/categories?saved=1");
}

export async function setOrderStatus(form: FormData) {
  await requireAdmin();
  const status = String(form.get("status"));
  const id = Number(form.get("id"));
  // Back to the same filtered list the admin was looking at.
  const back = String(form.get("back") ?? "");
  if (status === "cancelled") cancelOrder(id);
  // Cancelled is final: its stock was already returned. "Awaiting payment" is only ever set by checkout: set by hand,
  // the order would be auto-cancelled 30 minutes after it was placed. Only a real change counts, so re-saving doesn't
  // text the customer again.
  else if (status in ORDER_STATUSES && status !== "awaiting_payment") {
    const changed = db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ('cancelled', ?)").run(status, id, status).changes;
    if (changed && status === "shipped") after(() => notifyOrder(id, "shipped"));
  }
  redirect(back.startsWith("/admin") ? back : "/admin");
}

export async function deleteOrder(form: FormData) {
  await requireAdmin();
  const back = String(form.get("back") ?? "");
  purgeOrder(Number(form.get("id")));
  redirect(back.startsWith("/admin") ? back : "/admin");
}
