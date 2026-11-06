import { cookies } from "next/headers";
import { db } from "./db";

/** variantId -> quantity, kept in a cookie so guests can shop before logging in. */
export type Cart = Record<string, number>;

export async function getCart(): Promise<Cart> {
  try {
    const parsed = JSON.parse((await cookies()).get("cart")?.value ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function setCart(cart: Cart) {
  (await cookies()).set("cart", JSON.stringify(cart), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** The discount code the customer applied in the cart; checked again at checkout, so the cookie is never trusted. */
export async function getCouponCode() {
  return (await cookies()).get("coupon")?.value ?? "";
}

export async function setCouponCode(code: string) {
  const store = await cookies();
  if (code) store.set("coupon", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  else store.delete("coupon");
}

export type CartLine = {
  id: number;
  size: string;
  color: string;
  stock: number;
  product_id: number;
  name: string;
  price: number;
  image: string;
  qty: number;
};

export async function getCartLines() {
  const lines: CartLine[] = [];
  for (const [id, qty] of Object.entries(await getCart())) {
    if (!Number.isInteger(qty) || qty < 1) continue;
    const row = db
      .prepare(
        `SELECT v.id, v.size, v.color, v.stock, p.id AS product_id, p.name, p.price,
                COALESCE((SELECT path FROM product_images i WHERE i.product_id = p.id AND i.color = v.color ORDER BY i.id LIMIT 1), p.image) AS image
         FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.active = 1`,
      )
      .get(Number(id)) as Omit<CartLine, "qty"> | undefined;
    if (row) lines.push({ ...row, qty });
  }
  return lines;
}
