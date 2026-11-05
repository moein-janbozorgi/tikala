"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** Infinite scroll: loads the next page once this nears the screen. Without JavaScript it is a plain "show more" link. */
export function LoadMore({ href }: { href: string }) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const [pending, startTransition] = useTransition();
  // The login modal lives in the URL (?auth=…) and this href doesn't carry it, so loading now would close the modal
  // mid-typing. Wait until it closes; the new observer then fires at once if the end is still near.
  const authOpen = useSearchParams().has("auth");

  useEffect(() => {
    if (authOpen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startTransition(() => router.replace(href, { scroll: false }));
      },
      { rootMargin: "600px" }, // start loading before the customer reaches the end
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [href, router, authOpen]);

  return (
    <Link ref={ref} href={href} replace scroll={false} aria-busy={pending} className="btn-ghost mx-auto mt-10 flex w-fit">
      {pending ? "در حال بارگذاری…" : "نمایش محصولات بیشتر"}
    </Link>
  );
}
