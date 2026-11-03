"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** Infinite scroll: loads the next page once this nears the screen. Without JavaScript it is a plain "show more" link. */
export function LoadMore({ href }: { href: string }) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startTransition(() => router.replace(href, { scroll: false }));
      },
      { rootMargin: "600px" }, // start loading before the customer reaches the end
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [href, router]);

  return (
    <Link ref={ref} href={href} replace scroll={false} aria-busy={pending} className="btn-ghost mx-auto mt-10 flex w-fit">
      {pending ? "در حال بارگذاری…" : "نمایش محصولات بیشتر"}
    </Link>
  );
}
