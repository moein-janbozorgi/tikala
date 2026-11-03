import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <nav className="flex gap-2">
        <Link href="/admin" className="btn-ghost">
          سفارش‌ها
        </Link>
        <Link href="/admin/products" className="btn-ghost">
          محصولات
        </Link>
      </nav>
      {children}
    </div>
  );
}
