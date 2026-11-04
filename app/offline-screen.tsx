"use client";

import { useOffline } from "next/offline";
import { useEffect } from "react";
import { WifiOffArt } from "./icons";

/**
 * Full-screen "no connection" page while the site is open and the network drops. Next.js (experimental.useOffline)
 * keeps the click or form that failed pending and retries it when the connection returns, so this just goes away.
 * Reloading while offline is the service worker's job: it answers with public/offline.html.
 */
export function OfflineScreen() {
  const offline = useOffline();
  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);
  if (!offline) return null;
  return (
    <div role="alert" className="fixed inset-0 z-60 flex flex-col items-center justify-center bg-page p-4 text-center">
      <WifiOffArt className="size-36" />
      <h1 className="mt-6 font-display text-3xl">اتصال به اینترنت برقرار نیست</h1>
      <p className="mt-2 max-w-sm leading-8 text-muted">اتصال اینترنت خود را بررسی کنید. به محض برقراری اتصال، صفحه خودکار ادامه پیدا می‌کند.</p>
    </div>
  );
}
