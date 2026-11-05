"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "../icons";

/** Shows the login code at the top of the page for 7 seconds; used only when SMS isn't really sent (see sendLoginCode). */
export function CodeToast({ code }: { code: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 7000);
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;
  return (
    // No backdrop, so the code stays readable while it is typed into the form below.
    <div className="pointer-events-none fixed inset-x-0 top-4 z-60 flex justify-center px-4">
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-labelledby="code-toast"
        className="card pointer-events-auto relative w-full max-w-xs overflow-hidden p-5 text-center shadow-xl animate-[toast-out_0.4s_ease-in_6.6s_forwards]"
      >
        <button type="button" aria-label="بستن" className="icon-btn absolute inset-e-2 top-2" onClick={() => setOpen(false)}>
          <CloseIcon />
        </button>
        <p id="code-toast" className="font-medium">کد ورود شما:</p>
        <p dir="ltr" className="mt-2 text-3xl font-extrabold tracking-[0.3em] select-all">
          {code}
        </p>
        {/* Time left: shrinks from full width to nothing over the 7 seconds. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 origin-right bg-brand animate-[toast-bar_7s_linear_forwards]" />
      </div>
    </div>
  );
}
