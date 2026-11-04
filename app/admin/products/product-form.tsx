import { db, type Product, type Variant } from "@/lib/db";
import { saveProduct } from "../actions";
import { ProductImage } from "../../product-image";
import { CategoryFields } from "./category-fields";
import { FieldError, ValidatedForm } from "../../validated-form";
import { IMAGE_PATTERN } from "@/lib/rules";
import { MAX_PRICE } from "@/lib/validation";

/** Create form when `product` is missing, edit form otherwise. */
export function ProductForm({ product, variants = [] }: { product?: Product; variants?: Variant[] }) {
  const categories = (db.prepare("SELECT name FROM categories ORDER BY name").all() as { name: string }[]).map((c) => c.name);
  const types: Record<string, string[]> = {};
  for (const t of db.prepare("SELECT DISTINCT category, subcategory FROM products WHERE subcategory != '' ORDER BY subcategory").all() as {
    category: string;
    subcategory: string;
  }[])
    (types[t.category] ??= []).push(t.subcategory);
  return (
    <ValidatedForm action={saveProduct} className="card space-y-3">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm">نام محصول</span>
        <input name="name" defaultValue={product?.name} required minLength={2} maxLength={100} title="۲ تا ۱۰۰ کاراکتر" className="input" />
        <FieldError name="name" label="نام محصول" />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <CategoryFields categories={categories} types={types} category={product?.category ?? ""} subcategory={product?.subcategory ?? ""} />
        <label className="block">
          <span className="mb-1 block text-sm">قیمت (تومان)</span>
          <input name="price" type="number" min={1000} max={MAX_PRICE} step={1} defaultValue={product?.price} required dir="ltr" className="input" />
          <FieldError name="price" label="قیمت" />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm">تصویر محصول</legend>
        <div className="flex items-center gap-3">
          {product?.image ? <ProductImage src={product.image} alt="" className="size-16 shrink-0 rounded-lg" /> : null}
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-muted">بارگذاری فایل (JPG، PNG یا WEBP، حداکثر ۵ مگابایت)</span>
            <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" data-check="image" className="input text-sm file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1" />
            <FieldError name="imageFile" label="تصویر" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">یا آدرس تصویر (URL)</span>
          <input
            name="image"
            defaultValue={product?.image}
            dir="ltr"
            placeholder="https://..."
            maxLength={500}
            // Same rule as productProblem() on the server.
            pattern={IMAGE_PATTERN}
            title="آدرس باید با https:// یا / شروع شود."
            className="input"
          />
          <FieldError name="image" label="آدرس تصویر" />
        </label>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm">توضیحات</span>
        <textarea name="description" defaultValue={product?.description} rows={3} maxLength={2000} className="input" />
        <FieldError name="description" label="توضیحات" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">سایز | رنگ | موجودی (هر خط یک مورد)</span>
        <textarea
          name="variants"
          defaultValue={variants.map((v) => `${v.size} | ${v.color} | ${v.stock}`).join("\n")}
          placeholder={"M | مشکی | 10\nL | سفید | 5"}
          rows={5}
          className="input font-mono"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={product ? !!product.active : true} />
        <span>نمایش در فروشگاه</span>
      </label>
      <button className="btn">{product ? "ذخیره تغییرات" : "افزودن محصول"}</button>
    </ValidatedForm>
  );
}
