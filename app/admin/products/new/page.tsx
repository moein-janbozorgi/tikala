import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ErrorMessage } from "../../../error-message";
import { ProductForm } from "../product-form";

export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        → بازگشت به محصولات
      </Link>
      <h1 className="text-2xl font-extrabold">محصول جدید</h1>
      <ErrorMessage error={typeof error === "string" ? error : undefined} />
      <ProductForm />
    </div>
  );
}
