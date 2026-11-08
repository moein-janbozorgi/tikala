import { db, type Product, type Variant } from "@/lib/db";
import { saveProduct } from "../actions";
import { ProductImage } from "../../product-image";
import { CategoryFields } from "./category-fields";
import { FieldError, ValidatedForm } from "../../validated-form";
import { SubmitButton } from "../../submit-button";
import { IMAGE_PATTERN } from "@/lib/rules";
import { MAX_PRICE } from "@/lib/validation";

/** Create form when `product` is missing, edit form otherwise. */
export async function ProductForm({ product, variants = [] }: { product?: Product; variants?: Variant[] }) {
  const categories = ((await db.prepare("SELECT name FROM categories ORDER BY name").all()) as { name: string }[]).map((c) => c.name);
  const types: Record<string, string[]> = {};
  for (const t of (await db.prepare("SELECT DISTINCT category, subcategory FROM products WHERE subcategory != '' ORDER BY subcategory").all()) as {
    category: string;
    subcategory: string;
  }[])
    (types[t.category] ??= []).push(t.subcategory);
  const photos = product ? ((await db.prepare("SELECT id, path, color FROM product_images WHERE product_id = ? ORDER BY id").all(product.id)) as { id: number; path: string; color: string }[]) : [];
  const colors = [...new Set(variants.map((v) => v.color))];
  return (
    <ValidatedForm action={saveProduct} className="card space-y-3">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm">نام محصول</span>
        <input name="name" defaultValue={product?.name} required minLength={2} maxLength={100} title="۲ تا ۱۰۰ کاراکتر" className="input" />
        <FieldError name="name" label="نام محصول" />
      </label>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <CategoryFields categories={categories} types={types} category={product?.category ?? ""} subcategory={product?.subcategory ?? ""} />
        <label className="block">
          <span className="mb-1 block text-sm">قیمت (تومان)</span>
          <input name="price" type="number" min={1000} max={MAX_PRICE} step={1} defaultValue={product?.price} required dir="ltr" className="input" />
          <FieldError name="price" label="قیمت" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">قیمت قبل از تخفیف (اختیاری)</span>
          <input
            name="compare_price"
            type="number"
            min={1001}
            max={MAX_PRICE}
            step={1}
            defaultValue={product?.compare_price || ""}
            dir="ltr"
            aria-describedby="compare-hint"
            className="input"
          />
          <span id="compare-hint" className="mt-1 block text-xs text-muted">
            اگر پر شود، محصول با درصد تخفیف و در «حراج» نمایش داده می‌شود.
          </span>
          <FieldError name="compare_price" label="قیمت قبل از تخفیف" />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm">تصویر محصول</legend>
        <div className="flex items-center gap-3">
          {product?.image ? <ProductImage src={product.image} alt="" sizes="64px" className="size-16 shrink-0 rounded-lg" /> : null}
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
      <fieldset className="space-y-3 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm">تصاویر بیشتر (گالری، حداکثر ۸)</legend>
        <p className="text-xs leading-6 text-muted">
          برای هر تصویر می‌توانید رنگ آن را بنویسید (همان رنگ ستون «سایز | رنگ | موجودی»)؛ مشتری با انتخاب آن رنگ، تصاویرش را می‌بیند. خالی یعنی همه رنگ‌ها.
        </p>
        <datalist id="photo-colors">
          {colors.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {photos.length ? (
          <ul className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <li key={p.id} className="w-24 space-y-1 text-center text-xs text-muted">
                <ProductImage src={p.path} alt="" sizes="96px" className="size-24 rounded-lg" />
                <input name={`photo_color_${p.id}`} defaultValue={p.color} list="photo-colors" maxLength={20} placeholder="رنگ" aria-label="رنگ تصویر" className="input px-2 py-1 text-xs" />
                <label className="flex cursor-pointer items-center justify-center gap-1 has-checked:text-danger">
                  <input type="checkbox" name="remove_photo" value={p.id} />
                  حذف
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-xs text-muted">افزودن تصویر (می‌توانید چند فایل را با هم انتخاب کنید؛ هر کدام حداکثر ۵ مگابایت)</span>
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" data-check="image" className="input text-sm file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1" />
          <FieldError name="photos" label="تصاویر" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">رنگ تصاویر جدید (اختیاری)</span>
          <input name="photos_color" list="photo-colors" maxLength={20} placeholder="مثلاً مشکی" className="input" />
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
          aria-describedby="variants-hint"
          className="input font-mono"
        />
        <span id="variants-hint" className="mt-1 block text-xs leading-6 text-muted">
          نمونه سایز — لباس: S، M، L، XL · شلوار: 30، 32، 34، 36 (دور کمر به اینچ)، مثلاً «32 | مشکی | 6» · کفش: 40، 41، 42
        </span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={product ? !!product.active : true} />
        <span>نمایش در فروشگاه</span>
      </label>
      <SubmitButton className="btn">{product ? "ذخیره تغییرات" : "افزودن محصول"}</SubmitButton>
    </ValidatedForm>
  );
}
