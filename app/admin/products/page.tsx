import Link from "next/link";
import { db, type Product } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { toman } from "@/lib/format";
import { likeContains } from "@/lib/validation";
import { ErrorMessage } from "../../error-message";
import { ProductImage } from "../../product-image";
import { deleteProduct } from "../actions";
import { ConfirmButton } from "../confirm-button";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 50) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const categories = (db.prepare("SELECT name FROM categories ORDER BY name").all() as { name: string }[]).map((c) => c.name);

  const where = ["1"];
  const args: string[] = [];
  if (category) {
    where.push("p.category = ?");
    args.push(category);
  }
  if (q) {
    where.push("p.name LIKE ? ESCAPE '\\'");
    args.push(likeContains(q));
  }
  const products = db
    .prepare(
      `SELECT p.*, COALESCE(SUM(v.stock), 0) AS stock FROM products p LEFT JOIN variants v ON v.product_id = p.id
       WHERE ${where.join(" AND ")} GROUP BY p.id ORDER BY p.id DESC`,
    )
    .all(...args) as (Product & { stock: number })[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">
          محصولات <span className="text-base font-normal text-muted">({products.length.toLocaleString("fa-IR")})</span>
        </h1>
        <Link href="/admin/products/new" className="btn">
          + افزودن محصول
        </Link>
      </div>
      {params.deleted ? <p className="alert tone-success">محصول حذف شد.</p> : null}
      <ErrorMessage error={typeof params.error === "string" ? params.error : undefined} />

      <form action="/admin/products" role="search" className="flex flex-wrap gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="جستجوی نام محصول…" aria-label="جستجوی محصول" className="input min-w-48 flex-1" />
        <select name="category" defaultValue={category} aria-label="دسته‌بندی" className="input w-auto">
          <option value="">همه دسته‌بندی‌ها</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn-ghost">فیلتر</button>
      </form>

      {products.length === 0 ? <p className="py-10 text-center text-muted">محصولی پیدا نشد.</p> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {products.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
            <Link href={`/admin/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <ProductImage src={p.image} alt="" className="size-14 shrink-0 rounded-xl" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 font-medium">
                  {p.name}
                  {p.active ? null : <span className="badge tone-danger">مخفی</span>}
                  {p.stock === 0 ? <span className="badge tone-pending">ناموجود</span> : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{[p.category || "بدون دسته‌بندی", p.subcategory].filter(Boolean).join(" › ")}</span>
              </span>
            </Link>
            <span className="text-sm text-muted">
              {toman(p.price)} · موجودی {p.stock.toLocaleString("fa-IR")}
            </span>
            <span className="flex gap-1">
              <Link href={`/admin/products/${p.id}`} className="btn-ghost px-3 py-1.5">
                ویرایش
              </Link>
              <form action={deleteProduct}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton message={`«${p.name}» حذف شود؟ این کار قابل بازگشت نیست.`} className="btn-ghost px-3 py-1.5 text-danger hover:bg-danger/10">
                  حذف
                </ConfirmButton>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
