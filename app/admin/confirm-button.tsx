"use client";

/** Submit button that asks first; without JavaScript it submits directly. */
export function ConfirmButton({ message, ...props }: React.ComponentProps<"button"> & { message: string }) {
  return <button {...props} onClick={(e) => confirm(message) || e.preventDefault()} />;
}
