import type { Product, Variant } from "@/lib/db";
import { saveProduct } from "../actions";

/** Create form when `product` is missing, edit form otherwise. */
export function ProductForm({ product, variants = [] }: { product?: Product; variants?: Variant[] }) {
  return (
    <form action={saveProduct} className="card space-y-3">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm">نام محصول</span>
        <input name="name" defaultValue={product?.name} required className="input" />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm">دسته‌بندی</span>
          <input name="category" defaultValue={product?.category} placeholder="مثلاً: تی‌شرت" className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">قیمت (تومان)</span>
          <input name="price" type="number" min={1} defaultValue={product?.price} required dir="ltr" className="input" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm">آدرس تصویر (URL)</span>
        <input name="image" defaultValue={product?.image} dir="ltr" placeholder="https://..." className="input" />
      </label>
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
