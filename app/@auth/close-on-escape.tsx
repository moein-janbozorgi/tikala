"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Escape closes the auth modal: same as its ✕ link, back to the page under it. Renders nothing. */
export function CloseOnEscape({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) router.push(href, { scroll: false });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [router, href]);
  return null;
}
