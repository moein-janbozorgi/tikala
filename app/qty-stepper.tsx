"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "./icons";

/** − / count / + control that submits as `qty`. Without JS it still submits 1; the server re-checks stock either way. */
export function QtyStepper({ max }: { max: number }) {
  const [qty, setQty] = useState(1);
  const step = "grid size-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 sm:size-9";

  return (
    <div className="flex items-center rounded-full border border-line bg-surface">
      {/* In RTL the first child sits on the right, so + comes first. */}
      <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="افزایش تعداد" className={step}>
        <PlusIcon />
      </button>
      <output aria-live="polite" aria-label="تعداد" className="w-6 text-center font-medium sm:w-7">
        {qty.toLocaleString("fa-IR")}
      </output>
      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="کاهش تعداد" className={step}>
        <MinusIcon />
      </button>
      <input type="hidden" name="qty" value={qty} />
    </div>
  );
}
