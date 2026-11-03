"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** Search box that updates the results as the customer types. The form's button (or Enter) still searches, also without JavaScript. */
export function SearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pending, startTransition] = useTransition();
  // A search still waiting when the customer leaves the page must not pull them back.
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <input
      type="search"
      name="q"
      defaultValue={defaultValue}
      placeholder="جستجوی محصول…"
      aria-label="جستجوی محصول"
      aria-busy={pending}
      maxLength={50}
      className="input"
      onChange={(e) => {
        const form = e.currentTarget.form!;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          // Same fields the form would submit (category, type, q), minus empty ones.
          const params = new URLSearchParams();
          for (const [k, v] of new FormData(form)) if (typeof v === "string" && v.trim()) params.set(k, v.trim());
          startTransition(() => router.replace(params.size ? `/?${params}` : "/", { scroll: false }));
        }, 300); // wait for a pause in typing instead of loading on every key
      }}
    />
  );
}
