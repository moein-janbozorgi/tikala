import Link from "next/link";
import { db, type Product, type Variant } from "@/lib/db";
import { saveProduct } from "../actions";
import { ProductImage } from "../../product-image";

/** Create form when `product` is missing, edit form otherwise. */
export function ProductForm({ product, variants = [] }: { product?: Product; variants?: Variant[] }) {
  const categories = (db.prepare("SELECT name FROM categories ORDER BY name").all() as { name: string }[]).map((c) => c.name);
  const types = (db.prepare("SELECT DISTINCT subcategory FROM products WHERE subcategory != '' ORDER BY subcategory").all() as { subcategory: string }[]).map(
    (t) => t.subcategory,
  );
  return (
    <form action={saveProduct} className="card space-y-3">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm">نام محصول</span>
        <input name="name" defaultValue={product?.name} required className="input" />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 flex justify-between text-sm">
            دسته‌بندی
            <Link href="/admin/categories" className="text-xs text-accent hover:underline">
              + دسته جدید
            </Link>
          </span>
          <select name="category" defaultValue={product?.category ?? ""} className="input">
            <option value="">بدون دسته‌بندی</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">نوع (زیردسته)</span>
          {/* Suggests the types already in use; typing a new one creates it. */}
          <input name="subcategory" defaultValue={product?.subcategory} list="product-types" placeholder="مثلاً: کتانی" className="input" />
          <datalist id="product-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">قیمت (تومان)</span>
          <input name="price" type="number" min={1} defaultValue={product?.price} required dir="ltr" className="input" />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm">تصویر محصول</legend>
        <div className="flex items-center gap-3">
          {product?.image ? <ProductImage src={product.image} alt="" className="size-16 shrink-0 rounded-lg" /> : null}
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-muted">بارگذاری فایل (JPG، PNG یا WEBP، حداکثر ۵ مگابایت)</span>
            <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" className="input text-sm file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">یا آدرس تصویر (URL)</span>
          <input name="image" defaultValue={product?.image} dir="ltr" placeholder="https://..." className="input" />
        </label>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm">توضیحات</span>
        <textarea name="description" defaultValue={product?.description} rows={3} className="input" />
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
    </form>
  );
}
