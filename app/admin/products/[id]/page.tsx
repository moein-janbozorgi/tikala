import { notFound } from "next/navigation";
import { db, type Product, type Variant } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ErrorMessage } from "../../../error-message";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(id)) as Product | undefined;
  if (!product) notFound();
  const variants = db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY id").all(product.id) as Variant[];

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-extrabold">ویرایش {product.name}</h1>
      <ErrorMessage error={error} />
      <ProductForm product={product} variants={variants} />
    </div>
  );
}
