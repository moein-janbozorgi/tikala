"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyOrder } from "@/lib/sms";
import { cancelOrder, db, purgeOrder, saveVariants, transaction, variantsProblem } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/format";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { couponProblem, errorParam, normalizeCoupon, productProblem, toLatinDigits } from "@/lib/validation";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim().replace(/\s+/g, " ");
const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${errorParam(message)}`);

export async function saveProduct(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")) || 0;
  const name = text(form, "name");
  const price = Number(toLatinDigits(String(form.get("price") ?? "").trim()) || NaN);
  const comparePrice = Number(toLatinDigits(String(form.get("compare_price") ?? "").trim()) || 0);
  const category = text(form, "category");
  const subcategory = text(form, "subcategory");
  const description = String(form.get("description") ?? "").trim();
  const variants = String(form.get("variants") ?? "");
  let image = String(form.get("image") ?? "").trim();
  const back = id ? `/admin/products/${id}` : "/admin/products/new";
  if (id && !await db.prepare("SELECT 1 FROM products WHERE id = ?").get(id)) fail("/admin/products", "این محصول پیدا نشد");
  // The category field is free text, so a new name must pass the same rule as the categories page.
  const problem =
    productProblem({ name, price, compare_price: comparePrice, description, subcategory, image }) ?? (category ? categoryProblem(category) : null) ?? variantsProblem(variants);
  if (problem) fail(back, problem);
  // Extra photos: the ones ticked for removal go, new uploads are added, at most MAX_PHOTOS in all.
  const removed = form.getAll("remove_photo").map(Number);
  const keptPhotos = id ? ((await db.prepare("SELECT id FROM product_images WHERE product_id = ?").all(id)) as { id: number }[]).filter((p) => !removed.includes(p.id)).length : 0;
  const newPhotos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (keptPhotos + newPhotos.length > MAX_PHOTOS) fail(back, `حداکثر ${MAX_PHOTOS.toLocaleString("fa-IR")} تصویر اضافه برای هر محصول`);
  // Photo colors: "photo_color_<id>" for kept photos, "photos_color" for the new uploads; same 20-character limit as variant colors.
  const newColor = text(form, "photos_color");
  const photoColors = [...form.keys()].filter((k) => k.startsWith("photo_color_")).map((k) => ({ id: Number(k.slice(12)), color: text(form, k) }));
  if ([newColor, ...photoColors.map((p) => p.color)].some((c) => c.length > 20)) fail(back, "رنگ تصویر حداکثر ۲۰ کاراکتر است");

  // An uploaded file wins over the URL field.
  const file = form.get("imageFile");
  const photoPaths: string[] = [];
  let uploadError = "";
  try {
    if (file instanceof File && file.size > 0) image = await saveUpload(file);
    for (const photo of newPhotos) photoPaths.push(await saveUpload(photo));
  } catch (e) {
    uploadError = e instanceof Error ? e.message : "خطا در بارگذاری تصویر";
  }
  if (uploadError) fail(back, uploadError);
  // No main photo but gallery photos: the first one becomes the main photo, so cards and link previews have one.
  if (!image && photoPaths.length) image = photoPaths.shift()!;

  const values = [name, description, category, subcategory, price, comparePrice, image, form.get("active") ? 1 : 0];
  const gone: string[] = [];
  await transaction(async () => {
    const productId = id
      ? (await db.prepare("UPDATE products SET name=?, description=?, category=?, subcategory=?, price=?, compare_price=?, image=?, active=? WHERE id=?").run(...values, id), id)
      : ((await db.prepare("INSERT INTO products (name, description, category, subcategory, price, compare_price, image, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id").get(...values)) as { id: number }).id;
    await saveVariants(productId, variants);
    if (category) await db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(category);
    for (const photoId of removed) {
      const row = (await db.prepare("DELETE FROM product_images WHERE id = ? AND product_id = ? RETURNING path").get(photoId, productId)) as { path: string } | undefined;
      if (row) gone.push(row.path);
    }
    for (const p of photoColors) await db.prepare("UPDATE product_images SET color = ? WHERE id = ? AND product_id = ?").run(p.color, p.id, productId);
    for (const path of photoPaths) await db.prepare("INSERT INTO product_images (product_id, path, color) VALUES (?, ?, ?)").run(productId, path, newColor);
  });
  await deleteUnusedUploads(gone);
  redirect("/admin/products");
}

const MAX_PHOTOS = 8;

/** Deletes the files of photos no product shows any more. */
async function deleteUnusedUploads(paths: string[]) {
  for (const p of paths) {
    if (!(await db.prepare("SELECT 1 FROM products WHERE image = ? UNION SELECT 1 FROM product_images WHERE path = ?").get(p, p))) await deleteUpload(p);
  }
}

/** Deletes a product, its variants and its photo files. Past orders keep their own copy of the name, size, color and price. */
export async function deleteProduct(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const photos = ((await db.prepare("SELECT image AS path FROM products WHERE id = ? UNION SELECT path FROM product_images WHERE product_id = ?").all(id, id)) as { path: string }[]).map((r) => r.path);
  await db.prepare("DELETE FROM products WHERE id = ?").run(id);
  await deleteUnusedUploads(photos);
  redirect("/admin/products?deleted=1");
}

const categoryProblem = (name: string) => (name.length < 2 || name.length > 40 ? "نام دسته‌بندی باید ۲ تا ۴۰ کاراکتر باشد" : null);

export async function addCategory(form: FormData) {
  await requireAdmin();
  const name = text(form, "name");
  const problem = categoryProblem(name);
  if (problem) fail("/admin/categories", problem);
  if (!(await db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(name)).changes) fail("/admin/categories", "این دسته‌بندی از قبل وجود دارد");
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
  if (await db.prepare("SELECT 1 FROM categories WHERE name = ?").get(to)) fail("/admin/categories", "دسته‌بندی دیگری با این نام وجود دارد");
  await transaction(async () => {
    await db.prepare("UPDATE categories SET name = ? WHERE name = ?").run(to, from);
    await db.prepare("UPDATE products SET category = ? WHERE category = ?").run(to, from);
  });
  redirect("/admin/categories?saved=1");
}

/** The size guide shown on every product page of a category: lines of "cell | cell | …", the first one the header. */
export async function setSizeGuide(form: FormData) {
  await requireAdmin();
  const name = text(form, "name");
  const guide = String(form.get("size_guide") ?? "").replace(/\r/g, "").trim();
  if (guide.length > 2000 || guide.split("\n").length > 40) fail("/admin/categories", "راهنمای سایز حداکثر ۴۰ خط و ۲۰۰۰ کاراکتر است");
  await db.prepare("UPDATE categories SET size_guide = ? WHERE name = ?").run(guide, name);
  redirect("/admin/categories?saved=1");
}

/** Only empty categories can be deleted, so no product is left without one by accident. */
export async function deleteCategory(form: FormData) {
  await requireAdmin();
  const name = text(form, "name");
  if (await db.prepare("SELECT 1 FROM products WHERE category = ?").get(name)) fail("/admin/categories", "ابتدا محصولات این دسته‌بندی را حذف کنید یا به دسته دیگری ببرید");
  await db.prepare("DELETE FROM categories WHERE name = ?").run(name);
  redirect("/admin/categories?saved=1");
}

export async function setOrderStatus(form: FormData) {
  await requireAdmin();
  // The cancel button has its own name: the selected status radio is always sent along with it.
  const status = form.has("cancel") ? "cancelled" : String(form.get("status"));
  const id = Number(form.get("id"));
  // Back to the same filtered list the admin was looking at.
  const back = String(form.get("back") ?? "");
  const safeBack = back.startsWith("/admin") ? back : "/admin";
  // Saved before the status, so the "shipped" SMS sent below already carries it.
  if (form.has("tracking_code")) {
    const tracking = toLatinDigits(String(form.get("tracking_code"))).replace(/\s/g, "").toUpperCase();
    if (tracking && !/^[A-Z0-9-]{6,30}$/.test(tracking)) fail(safeBack, "کد رهگیری باید ۶ تا ۳۰ حرف انگلیسی یا عدد باشد");
    await db.prepare("UPDATE orders SET tracking_code = ? WHERE id = ?").run(tracking, id);
  }
  if (status === "cancelled") await cancelOrder(id);
  // Cancelled is final: its stock was already returned. "Awaiting payment" is only ever set by checkout: set by hand,
  // the order would be auto-cancelled 30 minutes after it was placed. Only a real change counts, so re-saving doesn't
  // text the customer again.
  else if (status in ORDER_STATUSES && status !== "awaiting_payment") {
    const changed = (await db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ('cancelled', ?)").run(status, id, status)).changes;
    if (changed && status === "shipped") after(() => notifyOrder(id, "shipped"));
  }
  redirect(safeBack);
}

export async function deleteOrder(form: FormData) {
  await requireAdmin();
  const back = String(form.get("back") ?? "");
  await purgeOrder(Number(form.get("id")));
  redirect(back.startsWith("/admin") ? back : "/admin");
}

const num = (form: FormData, key: string) => Number(toLatinDigits(String(form.get(key) ?? "").trim()) || 0);

/** Creates a discount code: a percentage or a fixed amount off the goods, with optional minimum, use limit and expiry. */
export async function addCoupon(form: FormData) {
  await requireAdmin();
  const maxUses = String(form.get("max_uses") ?? "").trim();
  const coupon = {
    code: normalizeCoupon(form.get("code")),
    percent: form.get("kind") === "percent" ? num(form, "value") : 0,
    amount: form.get("kind") === "amount" ? num(form, "value") : 0,
    min_total: num(form, "min_total"),
    max_uses: maxUses ? num(form, "max_uses") : null,
    expires_on: String(form.get("expires_on") ?? "").trim(),
  };
  const problem = couponProblem(coupon);
  if (problem) fail("/admin/coupons", problem);
  const added = (await db
    .prepare("INSERT OR IGNORE INTO coupons (code, percent, amount, min_total, max_uses, expires_on) VALUES (?, ?, ?, ?, ?, ?)")
    .run(coupon.code, coupon.percent, coupon.amount, coupon.min_total, coupon.max_uses, coupon.expires_on)).changes;
  if (!added) fail("/admin/coupons", "این کد تخفیف از قبل وجود دارد");
  redirect("/admin/coupons?saved=1");
}

/** Turns a code on or off; off codes are refused at checkout but kept, with their usage count. */
export async function toggleCoupon(form: FormData) {
  await requireAdmin();
  await db.prepare("UPDATE coupons SET active = 1 - active WHERE code = ?").run(String(form.get("code") ?? ""));
  redirect("/admin/coupons");
}

/** Deletes a code. Orders that used it keep its name and the discount they got. */
export async function deleteCoupon(form: FormData) {
  await requireAdmin();
  await db.prepare("DELETE FROM coupons WHERE code = ?").run(String(form.get("code") ?? ""));
  redirect("/admin/coupons");
}
