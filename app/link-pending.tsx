"use client";

import { useLinkStatus } from "next/link";

/**
 * Put inside a <Link>: marks its content data-pending while the click waits for the server, so a slow connection
 * still shows the tap landed (category and sort links keep the old list on screen until the new one arrives).
 * Style it with data-pending: classes; it never changes size, so nothing shifts.
 */
export function LinkPending({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span data-pending={pending || undefined} className={className}>
      {children}
    </span>
  );
}
