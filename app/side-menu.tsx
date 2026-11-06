"use client";

import Link from "next/link";
import { CloseIcon } from "./icons";

type Category = { category: string; types: string[] };

const href = (category: string, type?: string) => `/?${new URLSearchParams(type ? { category, type } : { category })}`;

/**
 * Category drawer, opened by the header's menu button (popovertarget="side-menu"). The browser's popover handles
 * opening, the backdrop, Esc and clicking outside; the only script here closes it when a link is followed.
 * Each category is a <details> that opens to show its types.
 */
export function SideMenu({ categories }: { categories: Category[] }) {
  return (
    <div
      id="side-menu"
      popover="auto"
      aria-label="دسته‌بندی محصولات"
      onClick={(e) => {
        if ((e.target as Element).closest("a")) e.currentTarget.hidePopover();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-72 max-w-[85vw] overflow-y-auto border-0 border-l border-line bg-surface p-0 text-ink shadow-2xl transition-transform duration-300 backdrop:bg-black/40 starting:open:translate-x-full"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <p className="text-lg font-extrabold">دسته‌بندی‌ها</p>
        <button popoverTarget="side-menu" popoverTargetAction="hide" className="icon-btn" aria-label="بستن منو">
          <CloseIcon />
        </button>
      </div>
      <nav className="space-y-1 p-3">
        <Link href="/" className="flex rounded-xl px-3 py-2.5 font-medium hover:bg-surface-2">
          همه محصولات
        </Link>
        {categories.map((c) =>
          c.types.length ? (
            <details key={c.category} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                {c.category}
                <span aria-hidden="true" className="text-muted transition-transform group-open:-rotate-90">
                  ‹
                </span>
              </summary>
              <div className="mt-1 mb-2 space-y-0.5 border-r border-line pr-3 mr-5">
                {c.types.map((t) => (
                  <Link key={t} href={href(c.category, t)} className="flex rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                    {t}
                  </Link>
                ))}
              </div>
            </details>
          ) : (
            <Link key={c.category} href={href(c.category)} className="flex rounded-xl px-3 py-2.5 hover:bg-surface-2">
              {c.category}
            </Link>
          ),
        )}
      </nav>
      <nav aria-label="تیکلا" className="border-t border-line p-3">
        <Link href="/about" className="flex rounded-xl px-3 py-2.5 hover:bg-surface-2">
          درباره ما
        </Link>
        {/* Plain anchor: the footer is in the root layout, so #contact exists on every page. */}
        <a href="#contact" className="flex rounded-xl px-3 py-2.5 hover:bg-surface-2">
          تماس با ما
        </a>
      </nav>
    </div>
  );
}
