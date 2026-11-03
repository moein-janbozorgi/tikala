import Link from "next/link";
import { db, type Product } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { toman } from "@/lib/format";
import { ErrorMessage } from "../../error-message";
import { ProductImage } from "../../product-image";
import { ProductForm } from "./product-form";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const { error } = await searchParams;
  const products = db
    .prepare("SELECT p.*, COALESCE(SUM(v.stock), 0) AS stock FROM products p LEFT JOIN variants v ON v.product_id = p.id GROUP BY p.id ORDER BY p.id DESC")
    .all() as (Product & { stock: number })[];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h1 className="mb-4 text-2xl font-extrabold">محصولات</h1>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                <ProductImage src={p.image} alt="" className="size-12 rounded-lg" />
                <span className="flex-1">
                  {p.name} {p.active ? null : <span className="badge tone-danger">مخفی</span>}
                </span>
                <span className="text-sm text-muted">
                  {toman(p.price)} · موجودی {p.stock.toLocaleString("fa-IR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="mb-4 text-2xl font-extrabold">محصول جدید</h2>
        <ErrorMessage error={error} />
        <ProductForm />
      </div>
    </div>
  );
}
