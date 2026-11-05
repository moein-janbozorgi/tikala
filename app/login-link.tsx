"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Opens the login modal over the current page, keeping the page's own params (e.g. ?page=3 of the product list), so
 * the list behind the modal doesn't shrink back to its first page and the scroll position survives.
 */
export function LoginLink({ className }: { className: string }) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams());
  params.set("auth", "login");
  return (
    <Link href={`${pathname}?${params}`} scroll={false} className={className}>
      ورود / ثبت‌نام
    </Link>
  );
}
