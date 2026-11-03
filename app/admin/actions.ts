"use server";

import { redirect } from "next/navigation";
import { cancelOrder, db, saveVariants } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/format";

export async function saveProduct(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")) || 0;
  const name = String(form.get("name") ?? "").trim();
  const price = Math.floor(Number(form.get("price")));
  const image = String(form.get("image") ?? "").trim();
  const back = id ? `/admin/products/${id}` : "/admin/products";
  if (!name || !(price > 0)) redirect(`${back}?error=${encodeURIComponent("نام و قیمت معتبر وارد کنید")}`);
  if (image && !/^(https?:\/\/|\/)/.test(image)) redirect(`${back}?error=${encodeURIComponent("آدرس تصویر معتبر نیست")}`);

  const values = [
    name,
    String(form.get("description") ?? "").trim(),
    String(form.get("category") ?? "").trim(),
    price,
    image,
    form.get("active") ? 1 : 0,
  ];
  const productId = id
    ? (db.prepare("UPDATE products SET name=?, description=?, category=?, price=?, image=?, active=? WHERE id=?").run(...values, id), id)
    : (db.prepare("INSERT INTO products (name, description, category, price, image, active) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").get(...values) as { id: number }).id;
  saveVariants(productId, String(form.get("variants") ?? ""));
  redirect("/admin/products");
}

export async function setOrderStatus(form: FormData) {
  await requireAdmin();
  const status = String(form.get("status"));
  const id = Number(form.get("id"));
  if (status === "cancelled") cancelOrder(id);
  // Cancelled is final: its stock was already returned.
  else if (status in ORDER_STATUSES) db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status != 'cancelled'").run(status, id);
  redirect("/admin");
}
