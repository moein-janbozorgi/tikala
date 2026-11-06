"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "./api/suggest/route";
import { CloseIcon, SearchIcon, TrendIcon } from "./icons";
import { ProductImage } from "./product-image";

// Listing filters a search keeps when it starts on the home page.
const KEEP = ["category", "type", "sort", "sale", "min", "max"];
const listing = (params: Record<string, string>) => `/?${new URLSearchParams(params)}`;

// This visitor's last searches, in this browser only. Storage can be blocked (private mode), so every access is guarded.
const RECENT = "recent-searches";
function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    return Array.isArray(list) ? list.filter((s) => typeof s === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {}
}

/**
 * Search box opened by the header's search field (#search-trigger, popovertarget="search-box"). It opens just under
 * that field with a dropdown of suggestions under its own input: before typing, this visitor's recent searches and
 * the shop's popular ones; while typing, matching categories and products. The browser's
 * popover handles Esc and clicking outside; Enter searches, also without JavaScript.
 */
export function SearchBox({ categories, popular }: { categories: { category: string; types: string[] }[]; popular: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keep = pathname === "/" ? [...params].filter(([k, v]) => KEEP.includes(k) && v) : [];
  const [q, setQ] = useState(params.get("q") ?? "");
  const [found, setFound] = useState<{ q: string; items: Suggestion[] }>();
  const [recent, setRecent] = useState<string[]>([]);
  const typed = q.trim();
  const products = found?.q === typed ? found.items : null; // null: still loading for this text

  function remember(term: string) {
    const list = [term, ...readRecent().filter((s) => s !== term)].slice(0, 8);
    writeRecent(list);
    setRecent(list);
  }

  // A search chip: runs that search and counts as a recent one.
  const termLink = (term: string, trending = false) => (
    <Link data-option key={term} href={listing({ q: term })} onClick={() => remember(term)} className="chip gap-1.5 px-3 py-1 focus:border-ink focus-visible:outline-none!">
      {trending ? (
        <span className="text-muted [&_svg]:size-4">
          <TrendIcon />
        </span>
      ) : null}
      {term}
    </Link>
  );

  useEffect(() => {
    const box = ref.current!;
    const onBeforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      setQ(new URLSearchParams(location.search).get("q") ?? "");
      setRecent(readRecent());
      // Under the header field, lined up with it on wide screens (wider if it is narrow); full width on phones.
      // shortcut: placed once when opened, so resizing while open leaves it where it was; recompute on resize if that matters.
      const r = document.getElementById("search-trigger")!.getBoundingClientRect();
      const wide = r.width >= 200;
      Object.assign(box.style, {
        inset: "auto",
        top: `${r.bottom + 8}px`,
        right: `${wide ? innerWidth - r.right : 16}px`,
        width: wide ? `${Math.min(Math.max(r.width, 448), r.right - 16)}px` : `${innerWidth - 32}px`,
      });
    };
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") input.current!.focus();
    };
    box.addEventListener("beforetoggle", onBeforeToggle);
    box.addEventListener("toggle", onToggle);
    return () => {
      box.removeEventListener("beforetoggle", onBeforeToggle);
      box.removeEventListener("toggle", onToggle);
    };
  }, []);

  // Matching products, after a pause in typing; a newer request cancels the one before it.
  useEffect(() => {
    if (!typed) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      // A stalled connection gives up after 8 s and shows "nothing found"; Enter still searches.
      fetch(`/api/suggest?${new URLSearchParams({ q: typed })}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) })
        .then((res) => (res.ok ? res.json() : []))
        .then((items: Suggestion[]) => setFound({ q: typed, items }))
        // Offline or a server error: show "nothing found" rather than loading forever; Enter still searches.
        .catch(() => abort.signal.aborted || setFound({ q: typed, items: [] }));
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [typed]);

  const matches = typed
    ? categories
        .flatMap((c) => [
          ...(c.category.includes(typed) ? [{ label: c.category, href: listing({ category: c.category }) }] : []),
          ...c.types.filter((t) => t.includes(typed)).map((t) => ({ label: `${t} در ${c.category}`, href: listing({ category: c.category, type: t }) })),
        ])
        .slice(0, 4)
    : [];

  // Arrow keys move between the input and the suggestions.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [input.current!, ...ref.current!.querySelectorAll<HTMLElement>("[data-option]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    e.preventDefault();
  }

  return (
    <div
      ref={ref}
      id="search-box"
      popover="auto"
      aria-label="جستجوی محصول"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if ((e.target as Element).closest("a")) e.currentTarget.hidePopover();
      }}
      // outline-none! (important): the unlayered :focus-visible rule in globals.css beats plain Tailwind utilities.
      className="fixed m-0 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl outline-none! transition duration-150 backdrop:bg-black/30 starting:open:-translate-y-1 starting:open:opacity-0"
    >
      <form
        action="/"
        role="search"
        className="sticky top-0 z-10 bg-surface p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = new URLSearchParams();
          for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v.trim()) next.set(k, v.trim());
          if (typed) remember(typed);
          router.push(next.size ? `/?${next}` : "/");
          ref.current!.hidePopover();
        }}
      >
        {keep.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="flex h-11 items-center gap-1 rounded-xl bg-surface-2 ps-3 pe-1">
          <span className="text-muted">
            <SearchIcon />
          </span>
          <input
            ref={input}
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی محصول…"
            aria-label="جستجوی محصول"
            maxLength={50}
            autoComplete="off"
            // The browser's own clear ✕ is hidden; the close button below is the only one.
            className="h-full min-w-0 flex-1 bg-transparent px-1 text-base outline-none! placeholder:text-muted sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          <button
            type="button"
            popoverTarget="search-box"
            popoverTargetAction="hide"
            className="icon-btn size-8 shrink-0 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none!"
            aria-label="بستن جستجو"
          >
            <CloseIcon />
          </button>
        </div>
      </form>

      <div className="px-2 pb-2 text-sm">
        {!typed ? (
          <>
            {recent.length ? (
              <section className="px-2 pb-4">
                <div className="flex items-center justify-between pt-1 pb-2.5">
                  <h2 className="font-bold">جستجوهای اخیر</h2>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-ink focus-visible:text-ink focus-visible:outline-none!"
                    onClick={() => {
                      writeRecent([]);
                      setRecent([]);
                      input.current!.focus();
                    }}
                  >
                    پاک کردن
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">{recent.map((term) => termLink(term))}</div>
              </section>
            ) : null}
            {popular.length ? (
              <section className="px-2 pb-4">
                <h2 className="pt-1 pb-2.5 font-bold">جستجوهای پرطرفدار</h2>
                <div className="flex flex-wrap gap-2">{popular.map((term) => termLink(term, true))}</div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {matches.length ? (
              <ul className="mb-1 border-b border-line pb-1">
                {matches.map((m) => (
                  <li key={m.href}>
                    <Link data-option href={m.href} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-none!">
                      <span className="text-muted">
                        <SearchIcon />
                      </span>
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {products === null ? (
              <p className="px-2 py-3 text-muted">در حال جستجو…</p>
            ) : products.length ? (
              <ul>
                {products.map((p) => (
                  <li key={p.id}>
                    <Link data-option href={`/product/${p.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-none!">
                      <ProductImage src={p.image} alt="" className="size-12 shrink-0 rounded-lg text-[0px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="text-xs text-muted">{p.category}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold">{p.price.toLocaleString("fa-IR")} تومان</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-3 text-muted">محصولی با «{typed}» پیدا نشد.</p>
            )}
            <button
              type="button"
              data-option
              className="mt-1 w-full rounded-lg px-2 py-2.5 text-start font-medium text-accent hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-none!"
              onClick={() => ref.current!.querySelector("form")!.requestSubmit()}
            >
              مشاهده همه نتایج برای «{typed}»
            </button>
          </>
        )}
      </div>
    </div>
  );
}
