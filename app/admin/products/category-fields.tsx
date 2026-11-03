"use client";

import Link from "next/link";
import { useState } from "react";

/** Category select + type input; the type suggestions follow the selected category. */
export function CategoryFields({
  categories,
  types,
  category: initialCategory,
  subcategory,
}: {
  categories: string[];
  types: Record<string, string[]>;
  category: string;
  subcategory: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  return (
    <>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm">
          دسته‌بندی
          <Link href="/admin/categories" className="text-xs text-accent hover:underline">
            + دسته جدید
          </Link>
        </span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="input">
          <option value="">بدون دسته‌بندی</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">نوع (زیردسته)</span>
        {/* Suggests the types already used in this category; typing a new one creates it. */}
        <input name="subcategory" defaultValue={subcategory} list="product-types" placeholder="مثلاً: کتانی" className="input" />
        <datalist id="product-types">
          {(types[category] ?? []).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
    </>
  );
}
