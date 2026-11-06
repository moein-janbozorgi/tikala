"use client";

import { useFormStatus } from "react-dom";

/** A form's submit button that is off while the form is being sent, so a double tap can't place an order twice. */
export function SubmitButton(props: React.ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={pending || props.disabled} aria-busy={pending} />;
}
