"use client";

/** Submit button that asks first; without JavaScript it submits directly. */
export function ConfirmButton({ message, className, children, disabled }: { message: string; className: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} className={className} onClick={(e) => confirm(message) || e.preventDefault()}>
      {children}
    </button>
  );
}
