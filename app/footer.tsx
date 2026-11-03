import Link from "next/link";
import { FREE_SHIPPING_FROM, toman } from "@/lib/format";
import { CardIcon, CashIcon, ChevronUpIcon, InstagramIcon, TelegramIcon, TruckIcon } from "./icons";

// Fill these in; an empty value hides its item.
const PHONE = "";
const SOCIAL = [
  { label: "اینستاگرام", href: "", icon: <InstagramIcon /> },
  { label: "تلگرام", href: "", icon: <TelegramIcon /> },
].filter((s) => s.href);

export const FEATURES = [
  { label: `ارسال رایگان بالای ${toman(FREE_SHIPPING_FROM)}`, icon: <TruckIcon /> },
  { label: "امکان پرداخت هنگام تحویل", icon: <CashIcon /> },
  { label: "پرداخت آنلاین امن", icon: <CardIcon /> },
];

const href = (category: string) => `/?${new URLSearchParams({ category })}`;

export function Footer({ categories }: { categories: { category: string }[] }) {
  return (
    <footer className="mt-12 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="font-display text-3xl">
              تیکلا
            </Link>
            <p className="mt-2 text-sm text-muted">
              بوتیک تیکلا، عرضه کننده انواع لباس و شلوار مد روز
              {PHONE ? (
                <>
                  <span className="mx-2">|</span>
                  تلفن پشتیبانی: <a href={`tel:${PHONE}`} dir="ltr" className="hover:text-ink">{PHONE}</a>
                </>
              ) : null}
            </p>
          </div>
          {/* href="#" scrolls to the top without any script. */}
          <a href="#" className="btn-ghost text-muted">
            بازگشت به بالا
            <ChevronUpIcon />
          </a>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex flex-col items-center gap-3 text-center text-sm text-muted">
              <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-ink [&>svg]:size-7">{f.icon}</span>
              {f.label}
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
          <nav aria-label="دسترسی سریع">
            <p className="font-bold">دسترسی سریع</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li><Link href="/" className="hover:text-ink">همه محصولات</Link></li>
              <li><Link href="/cart" className="hover:text-ink">سبد خرید</Link></li>
              <li><Link href="/account" className="hover:text-ink">حساب کاربری و سفارش‌ها</Link></li>
              <li><Link href="/register" className="hover:text-ink">ثبت‌نام</Link></li>
            </ul>
          </nav>
          <nav aria-label="دسته‌بندی‌ها">
            <p className="font-bold">دسته‌بندی‌ها</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              {categories.map((c) => (
                <li key={c.category}>
                  <Link href={href(c.category)} className="hover:text-ink">{c.category}</Link>
                </li>
              ))}
            </ul>
          </nav>
          {SOCIAL.length ? (
            <div>
              <p className="font-bold">همراه ما باشید!</p>
              <ul className="mt-4 flex gap-2">
                {SOCIAL.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="icon-btn [&>svg]:size-6" aria-label={s.label} title={s.label}>
                      {s.icon}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false })} بوتیک تیکلا
      </p>
    </footer>
  );
}
