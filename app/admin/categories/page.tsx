import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ErrorMessage } from "../../error-message";
import { addCategory, deleteCategory, renameCategory } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { FieldError, ValidatedForm } from "../../validated-form";

const CATEGORY_RULE = "نام دسته‌بندی باید ۲ تا ۴۰ کاراکتر باشد.";

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requireAdmin();
  const { error, saved } = await searchParams;
  const categories = db
    .prepare("SELECT c.name, COUNT(p.id) AS n FROM categories c LEFT JOIN products p ON p.category = c.name GROUP BY c.name ORDER BY c.name")
    .all() as { name: string; n: number }[];
  const types = Map.groupBy(
    db.prepare("SELECT DISTINCT category, subcategory FROM products WHERE subcategory != '' ORDER BY subcategory").all() as { category: string; subcategory: string }[],
    (t) => t.category,
  );

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold">دسته‌بندی‌ها</h1>
      {saved ? <p className="alert tone-success">تغییرات ذخیره شد.</p> : null}
      <ErrorMessage error={error} />

      <ValidatedForm action={addCategory} className="card flex flex-wrap items-end gap-3">
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium">دسته‌بندی جدید</span>
          <input name="name" required minLength={2} maxLength={40} title={CATEGORY_RULE} placeholder="مثلاً: کیف" className="input" />
          <FieldError name="name" label="نام دسته‌بندی" />
        </label>
        <button className="btn">افزودن دسته‌بندی</button>
      </ValidatedForm>
      <p className="text-sm text-muted">
        دسته‌بندی‌های بدون محصول در فروشگاه نمایش داده نمی‌شوند. «نوع» هر محصول (مثل کتانی یا بوت) را در فرم همان محصول بنویسید؛ در منوی فروشگاه زیر دسته‌بندی آن
        نمایش داده می‌شود.
      </p>

      {categories.length === 0 ? <p className="py-10 text-center text-muted">هنوز دسته‌بندی‌ای ساخته نشده است.</p> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {categories.map((c) => (
          <li key={c.name} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{c.name}</span>
              <Link href={`/admin/products?${new URLSearchParams({ category: c.name })}`} className="text-sm text-accent hover:underline">
                {c.n.toLocaleString("fa-IR")} محصول
              </Link>
              {(types.get(c.name) ?? []).map((t) => (
                <span key={t.subcategory} className="badge tone-processing">
                  {t.subcategory}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ValidatedForm action={renameCategory} className="min-w-60 flex-1">
                <div className="flex gap-2">
                  <input type="hidden" name="from" value={c.name} />
                  <input name="name" defaultValue={c.name} required minLength={2} maxLength={40} title={CATEGORY_RULE} aria-label={`نام جدید ${c.name}`} className="input py-1.5" />
                  <button className="btn-ghost shrink-0 px-3 py-1.5">تغییر نام</button>
                </div>
                <FieldError name="name" label="نام دسته‌بندی" />
              </ValidatedForm>
              <form action={deleteCategory}>
                <input type="hidden" name="name" value={c.name} />
                <ConfirmButton
                  message={`دسته‌بندی «${c.name}» حذف شود؟`}
                  disabled={c.n > 0}
                  className="btn-ghost px-3 py-1.5 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  حذف
                </ConfirmButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
