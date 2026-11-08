import Link from "next/link";
import { notFound } from "next/navigation";
import { db, type Product, type Variant } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ErrorMessage } from "../../../error-message";
import { deleteProduct } from "../../actions";
import { ConfirmButton } from "../../confirm-button";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const product = (await db.prepare("SELECT * FROM products WHERE id = ?").get(Number(id))) as Product | undefined;
  if (!product) notFound();
  const variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY id").all(product.id)) as Variant[];

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        → بازگشت به محصولات
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">ویرایش {product.name}</h1>
        <Link href={`/product/${product.id}`} className="text-sm text-accent hover:underline">
          مشاهده در فروشگاه
        </Link>
      </div>
      <ErrorMessage error={error} />
      <ProductForm product={product} variants={variants} />
      <form action={deleteProduct} className="card flex flex-wrap items-center justify-between gap-3 border-danger/40">
        <input type="hidden" name="id" value={product.id} />
        <p className="text-sm text-muted">حذف محصول قابل بازگشت نیست. سفارش‌های قبلی آن حفظ می‌شوند. برای پنهان کردن موقت، تیک «نمایش در فروشگاه» را بردارید.</p>
        <ConfirmButton message={`«${product.name}» حذف شود؟ این کار قابل بازگشت نیست.`} className="btn-ghost border-danger/50 text-danger hover:bg-danger/10">
          حذف محصول
        </ConfirmButton>
      </form>
    </div>
  );
}
