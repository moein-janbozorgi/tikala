"use client";

import { useEffect, useState } from "react";

/** "Send the code again", disabled with a live countdown until the server allows a new code. */
export function ResendButton({ wait }: { wait: number }) {
  const [left, setLeft] = useState(wait);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return (
    <button disabled={left > 0} className="text-accent hover:underline disabled:text-muted disabled:no-underline">
      {left > 0 ? (
        <>
          ارسال دوباره کد تا <span className="tabular-nums">{left.toLocaleString("fa-IR")}</span> ثانیه دیگر
        </>
      ) : (
        "ارسال دوباره کد"
      )}
    </button>
  );
}
