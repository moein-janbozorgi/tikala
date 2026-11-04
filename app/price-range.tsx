"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PRICE_STEP } from "@/lib/format";

/**
 * Two-handle price slider, easy to drag with a thumb on a phone. The list updates once the customer lets go of a handle;
 * without JavaScript the form's own button submits the two values. A handle left at its end means "no limit".
 */
export function PriceRange({ lo, hi, min, max }: { lo: number; hi: number; min?: number; max?: number }) {
  const router = useRouter();
  const [from, setFrom] = useState(min ?? lo);
  const [to, setTo] = useState(max ?? hi);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const fa = (v: number) => v.toLocaleString("fa-IR");

  // The native "change" event (React's onChange is "input") fires when a handle is let go, also off the slider, and per
  // arrow-key step. Loading on every move instead would reload mid-drag and drop the handle under the finger.
  useEffect(() => {
    const el = box.current!;
    const onChange = (e: Event) => {
      const form = (e.target as HTMLInputElement).form!;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(form)) if (typeof v === "string" && v) params.set(k, v);
        if (Number(params.get("min")) <= lo) params.delete("min");
        if (Number(params.get("max")) >= hi) params.delete("max");
        startTransition(() => router.replace(params.size ? `/?${params}` : "/", { scroll: false }));
      }, 300); // a burst of arrow-key presses loads once
    };
    el.addEventListener("change", onChange);
    return () => {
      el.removeEventListener("change", onChange);
      clearTimeout(timer.current);
    };
  }, [lo, hi, router]);

  const handle = (which: "min" | "max", value: number, other: number) => (
    <input
      type="range"
      name={which}
      min={lo}
      max={hi}
      step={PRICE_STEP}
      value={value}
      aria-label={which === "min" ? "حداقل قیمت" : "حداکثر قیمت"}
      aria-valuetext={`${fa(value)} تومان`}
      onChange={(e) => {
        // The handles can meet but not cross.
        const v = Number(e.target.value);
        if (which === "min") setFrom(Math.min(v, other));
        else setTo(Math.max(v, other));
      }}
      className="price-thumb pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent"
    />
  );

  return (
    <div ref={box} className="w-full sm:max-w-sm" aria-busy={pending}>
      <p className="mb-1 flex justify-between gap-2 text-xs">
        <span>
          <span className="text-muted">قیمت: </span>از {fa(from)} تومان
        </span>
        <span>تا {fa(to)} تومان</span>
      </p>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink"
          style={{ insetInlineStart: `${pct(from)}%`, insetInlineEnd: `${100 - pct(to)}%` }}
        />
        {handle("min", from, to)}
        {handle("max", to, from)}
      </div>
    </div>
  );
}
