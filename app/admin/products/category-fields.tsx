"use client";

import Link from "next/link";
import { useState } from "react";
import { Combobox } from "../../combobox";

/** Category + type comboboxes; the type suggestions follow the chosen category. Typing a new name creates it on save. */
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
  const [type, setType] = useState(subcategory);
  return (
    <>
      <Combobox
        name="category"
        label="دسته‌بندی"
        extra={
          <Link href="/admin/categories" className="text-xs font-normal text-accent hover:underline">
            + مدیریت دسته‌ها
          </Link>
        }
        placeholder="بدون دسته‌بندی"
        hint={(t) => `دسته جدید «${t}» ساخته می‌شود.`}
        options={categories}
        value={category}
        onChange={setCategory}
      />
      <Combobox
        name="subcategory"
        label="نوع (زیردسته)"
        placeholder="مثلاً: کتانی"
        hint={(t) => `نوع جدید «${t}» ساخته می‌شود.`}
        options={types[category.trim()] ?? []}
        value={type}
        onChange={setType}
      />
    </>
  );
}
