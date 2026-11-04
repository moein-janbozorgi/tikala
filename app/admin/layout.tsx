import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const LINKS = [
  ["/admin", "سفارش‌ها"],
  ["/admin/products", "محصولات"],
  ["/admin/categories", "دسته‌بندی‌ها"],
  ["/admin/coupons", "کدهای تخفیف"],
  ["/admin/reports", "گزارش فروش"],
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      {/* One sideways-scrolling row on phones instead of three wrapped rows. */}
      <nav className="-mx-4 flex items-center gap-2 overflow-x-auto border-b border-line px-4 pb-4 whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0 print:hidden">
        <span className="me-2 shrink-0 text-sm font-bold text-muted">پنل مدیریت</span>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="btn-ghost shrink-0">
            {label}
          </Link>
        ))}
        {/* A plain link: it's a file download, not a page. */}
        <a href="/admin/backup" download className="ms-auto shrink-0 text-sm text-muted hover:text-ink">
          دانلود نسخه پشتیبان
        </a>
        <Link href="/" className="shrink-0 text-sm text-muted hover:text-ink">
          مشاهده فروشگاه ←
        </Link>
      </nav>
      {children}
    </div>
  );
}
