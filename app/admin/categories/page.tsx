import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ErrorMessage } from "../../error-message";
import { addCategory, deleteCategory, renameCategory, setSizeGuide } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { FieldError, ValidatedForm } from "../../validated-form";

const CATEGORY_RULE = "نام دسته‌بندی باید ۲ تا ۴۰ کاراکتر باشد.";

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requireAdmin();
  const { error, saved } = await searchParams;
  const categories = db
    .prepare("SELECT c.name, c.size_guide, COUNT(p.id) AS n FROM categories c LEFT JOIN products p ON p.category = c.name GROUP BY c.name ORDER BY c.name")
    .all() as { name: string; size_guide: string; n: number }[];
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
            <details className="rounded-xl border border-line p-3" >
              <summary className="cursor-pointer text-sm font-medium">
                راهنمای سایز {c.size_guide ? <span className="badge tone-success ms-1">دارد</span> : <span className="text-xs text-muted">(ندارد)</span>}
              </summary>
              <form action={setSizeGuide} className="mt-3 space-y-2">
                <input type="hidden" name="name" value={c.name} />
                <textarea
                  name="size_guide"
                  defaultValue={c.size_guide}
                  rows={5}
                  maxLength={2000}
                  aria-label={`راهنمای سایز ${c.name}`}
                  placeholder={"سایز | دور سینه | قد\nS | ۹۶ | ۶۸\nM | ۱۰۰ | ۷۰\nاندازه‌ها به سانتی‌متر است."}
                  className="input font-mono text-sm"
                />
                <p className="text-xs text-muted">هر خط یک ردیف جدول، ستون‌ها با «|» جدا شوند؛ خط اول عنوان ستون‌هاست. خط بدون «|» زیر جدول به‌عنوان توضیح نمایش داده می‌شود.</p>
                <button className="btn-ghost px-3 py-1.5 text-sm">ذخیره راهنمای سایز</button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
