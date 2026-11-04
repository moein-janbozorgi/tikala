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
      <nav className="flex flex-wrap items-center gap-2 border-b border-line pb-4 print:hidden">
        <span className="me-2 text-sm font-bold text-muted">پنل مدیریت</span>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="btn-ghost">
            {label}
          </Link>
        ))}
        {/* A plain link: it's a file download, not a page. */}
        <a href="/admin/backup" download className="ms-auto text-sm text-muted hover:text-ink">
          دانلود نسخه پشتیبان
        </a>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          مشاهده فروشگاه ←
        </Link>
      </nav>
      {children}
    </div>
  );
}
