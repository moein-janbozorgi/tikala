"use client";

import { useId, useRef, useState } from "react";

/**
 * Submit button that asks in a modal first; without JavaScript it submits directly. The modal is only in the page while
 * open: admin lists have dozens of these buttons, and a dialog each made the pages heavy.
 */
export function ConfirmButton({ message, children, ...props }: React.ComponentProps<"button"> & { message: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        {...props}
        ref={button}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open ? (
        <dialog
          ref={(d) => {
            dialog.current = d;
            if (d && !d.open) d.showModal();
          }}
          onClose={() => setOpen(false)}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-message`}
          // The dialog has no padding, so a click whose target is the dialog itself landed on the backdrop.
          onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
          className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <span aria-hidden className="badge tone-danger grid size-12 place-items-center rounded-full p-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-6">
                <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <h2 id={`${id}-title`} className="text-lg font-bold">
              آیا مطمئن هستید؟
            </h2>
            <p id={`${id}-message`} className="text-sm leading-7 text-muted">
              {message}
            </p>
            {/* Cancel comes first so showModal() focuses it, not the destructive action. */}
            <div className="mt-2 flex w-full gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className="btn-ghost flex-1">
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  dialog.current?.close();
                  // Submitting with the original button keeps its name/value and formAction.
                  button.current?.form?.requestSubmit(button.current);
                }}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-danger px-4 py-2 text-sm font-bold text-page transition hover:brightness-95"
              >
                {children}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
