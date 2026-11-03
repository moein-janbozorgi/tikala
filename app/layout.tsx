import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Vazirmatn } from "next/font/google";
import { getUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { db } from "@/lib/db";
import { logout, setTheme } from "./actions";
import { BagIcon, MenuIcon, MoonIcon, SunIcon, SystemIcon, UserIcon } from "./icons";
import { SideMenu } from "./side-menu";
import "./globals.css";


const vazirmatn = Vazirmatn({ variable: "--font-vazirmatn", subsets: ["arabic", "latin"] });

export const metadata: Metadata = {
  title: { default: "تیکالا", template: "%s | تیکالا" },
  description: "بوتیک تیکالا عرضه کننده انواع لباس و شلوار مد روز",
};

// Every page shows the cart and login state from cookies, and products come from the database.
export const dynamic = "force-dynamic";

const THEMES = {
  system: { label: "هماهنگ با سیستم", icon: <SystemIcon />, next: "light" },
  light: { label: "روشن", icon: <SunIcon />, next: "dark" },
  dark: { label: "تیره", icon: <MoonIcon />, next: "system" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  const count = Object.values(await getCart()).reduce((a, b) => a + (Number.isInteger(b) && b > 0 ? b : 0), 0);
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : "system";
  // Category -> its types, for the side menu.
  const categories: { category: string; types: string[] }[] = [];
  const rows = db
    .prepare("SELECT DISTINCT category, subcategory FROM products WHERE active = 1 AND category != '' ORDER BY category, subcategory")
    .all() as { category: string; subcategory: string }[];
  for (const r of rows) {
    if (categories.at(-1)?.category !== r.category) categories.push({ category: r.category, types: [] });
    if (r.subcategory) categories.at(-1)!.types.push(r.subcategory);
  }

  return (
    <html lang="fa" dir="rtl" data-theme={theme === "system" ? undefined : theme} className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-line bg-page/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
            <button popoverTarget="side-menu" className="icon-btn" aria-label="دسته‌بندی محصولات" title="دسته‌بندی‌ها">
              <MenuIcon />
            </button>
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
              تیکالا
            </Link>
            <div className="ms-auto flex items-center gap-1 text-sm sm:gap-2">
              {user?.is_admin ? (
                <Link href="/admin" className="rounded-full px-3 py-2 hover:bg-surface-2">
                  مدیریت
                </Link>
              ) : null}
              {user ? (
                <>
                  <Link href="/account" className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-surface-2" aria-label="حساب کاربری">
                    <UserIcon />
                    <span className="hidden sm:inline">{user.name}</span>
                  </Link>
                  <form action={logout}>
                    <button className="rounded-full px-3 py-2 text-muted hover:bg-surface-2 hover:text-ink">خروج</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-full px-3 py-2 hover:bg-surface-2">
                  ورود / ثبت‌نام
                </Link>
              )}
              <form action={setTheme}>
                <button
                  name="theme"
                  value={THEMES[theme].next}
                  className="icon-btn"
                  aria-label={`تم: ${THEMES[theme].label}، برای تغییر کلیک کنید`}
                  title={`تم: ${THEMES[theme].label}`}
                >
                  {THEMES[theme].icon}
                </button>
              </form>
              <Link href="/cart" className="btn relative px-4" aria-label={`سبد خرید، ${count.toLocaleString("fa-IR")} کالا`}>
                <BagIcon />
                <span className="hidden sm:inline">سبد خرید</span>
                {count > 0 ? (
                  <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-ink text-[11px] text-page">
                    {count.toLocaleString("fa-IR")}
                  </span>
                ) : null}
              </Link>
            </div>
          </nav>
        </header>
        <SideMenu categories={categories} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted">
            <span>بوتیک تیکالا</span>
            <span>پرداخت آنلاین یا هنگام تحویل</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
