"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductWithStock } from "@/lib/products";
import { ProductCard } from "./product-card";

/**
 * Infinite scroll: once this nears the screen, the next page's cards come from /api/products and are added below, and
 * the address becomes ?page=N so a reload or shared link shows the same list. Without JavaScript (or after a failed
 * load) it is a plain "show more" link that renders the longer list on the server.
 * `api` is /api/products with the listing's filters; `page` the first page to load. The home page keys this on both,
 * so a server render (a new filter, or the longer list) starts it fresh instead of repeating cards.
 */
export function LoadMore({ href, api, page }: { href: string; api: string; page: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [items, setItems] = useState<ProductWithStock[]>([]);
  const [next, setNext] = useState(page);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const busy = useRef(false); // set synchronously, so two observer callbacks can't both start a fetch

  const stopped = status === "error" || status === "done";
  useEffect(() => {
    if (stopped) return;
    const abort = new AbortController();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || busy.current) return;
        busy.current = true;
        setStatus("loading");
        const url = new URL(api, location.origin);
        url.searchParams.set("page", String(next));
        // A stalled connection gives up after 8 s and offers the link instead of spinning forever.
        fetch(url, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) })
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
          .then(({ items: more, hasMore }: { items: ProductWithStock[]; hasMore: boolean }) => {
            setItems((prev) => [...prev, ...more]);
            setNext(next + 1);
            setStatus(hasMore ? "idle" : "done");
            const address = new URL(location.href);
            address.searchParams.set("page", String(next));
            history.replaceState(history.state, "", address);
          })
          .catch(() => abort.signal.aborted || setStatus("error"))
          .finally(() => (busy.current = false));
      },
      { rootMargin: "600px" }, // start loading before the customer reaches the end
    );
    observer.observe(ref.current!);
    return () => {
      observer.disconnect();
      abort.abort();
    };
  }, [api, next, stopped]);

  const linkHref = new URL(href, "http://x");
  linkHref.searchParams.set("page", String(next));
  return (
    <>
      {items.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : null}
      {status === "done" ? null : (
        <Link ref={ref} href={linkHref.pathname + linkHref.search} replace scroll={false} aria-busy={status === "loading"} className="btn-ghost mx-auto mt-10 flex w-fit">
          {status === "loading" ? "در حال بارگذاری…" : status === "error" ? "بارگذاری نشد؛ تلاش دوباره" : "نمایش محصولات بیشتر"}
        </Link>
      )}
    </>
  );
}
