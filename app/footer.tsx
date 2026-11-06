import Link from "next/link";
import { FREE_SHIPPING_FROM, toman } from "@/lib/format";
import { CardIcon, CashIcon, ChevronUpIcon, InstagramIcon, TelegramIcon, TruckIcon } from "./icons";

// Fill these in; an empty value hides its item, and the «تماس با ما» column shows once any of them is set.
const PHONE = "06623237174";
const EMAIL = "tikala@gmail.com"
const ADDRESS = "خیابان انقلاب_بازار رضا_ طبقه همکف پلاک ۱۰۸"
const HOURS = "شنبه تا پنجشنبه، ۹ تا ۱۸"
export const CONTACT = [
  { label: "تلفن پشتیبانی", value: PHONE, href: `tel:${PHONE.replace(/[^\d+]/g, "")}` },
  { label: "ایمیل", value: EMAIL, href: `mailto:${EMAIL}` },
  { label: "آدرس", value: ADDRESS },
  { label: "ساعات پاسخگویی", value: HOURS },
].filter((c) => c.value);
export const SOCIAL = [
  { label: "اینستاگرام", href: "https://www.instagram.com/tikla_boutique/", icon: <InstagramIcon /> },
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
    <footer className="mt-12 border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="font-display text-3xl">
              تیکلا
            </Link>
            <p className="mt-2 text-sm text-muted">
              بوتیک تیکلا، عرضه کننده انواع لباس و شلوار مد روز
            </p>
          </div>
          {/* href="#" scrolls to the top without any script. */}
          <a href="#" className="btn-ghost text-muted">
            بازگشت به بالا
            <ChevronUpIcon />
          </a>
        </div>

        <ul className="mt-8 grid grid-cols-3 gap-3 sm:mt-10 sm:gap-6">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex flex-col items-center gap-2 text-center text-xs text-muted sm:gap-3 sm:text-sm">
              <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink sm:size-14 [&>svg]:size-6 sm:[&>svg]:size-7">{f.icon}</span>
              {f.label}
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-line pt-8 sm:mt-10 sm:grid-cols-3 sm:pt-10">
          <nav aria-label="دسترسی سریع">
            <p className="font-bold">دسترسی سریع</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li><Link href="/" className="hover:text-ink">همه محصولات</Link></li>
              <li><Link href="/cart" className="hover:text-ink">سبد خرید</Link></li>
              <li><Link href="/account" className="hover:text-ink">حساب کاربری و سفارش‌ها</Link></li>
              <li><Link href="?auth=register" scroll={false} className="hover:text-ink">ثبت‌نام</Link></li>
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
          {CONTACT.length || SOCIAL.length ? (
            <nav id="contact" aria-label="تماس با ما" className="col-span-2 scroll-mt-24 sm:col-span-1">
              <p className="font-bold">تماس با ما</p>
              {CONTACT.length ? (
                <ul className="mt-4 space-y-3 text-sm text-muted">
                  {CONTACT.map((c) => (
                    <li key={c.label}>
                      {c.label}:{" "}
                      {c.href ? (
                        <a href={c.href} dir="ltr" className="hover:text-ink">
                          {c.value}
                        </a>
                      ) : (
                        c.value
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {SOCIAL.length ? (
                <ul aria-label="همراه ما باشید" className="mt-4 flex gap-2">
                  {SOCIAL.map((s) => (
                    <li key={s.label}>
                      <a href={s.href} target="_blank" rel="noopener noreferrer" className="icon-btn size-12 bg-surface-2 [&>svg]:size-8" aria-label={s.label} title={s.label}>
                        {s.icon}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false })} بوتیک تیکلا
      </p>
    </footer>
  );
}
