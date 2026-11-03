"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">مشکلی پیش آمد</h1>
      <p className="mt-2 text-muted">لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، کمی بعد سر بزنید.</p>
      <button onClick={() => retry()} className="btn mt-6">
        تلاش دوباره
      </button>
    </div>
  );
}
