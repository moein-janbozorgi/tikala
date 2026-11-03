"use client";

import { createContext, useContext, useRef, useState } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
// Per field name: true = left empty, a string = a ready message for any other problem.
type Errors = Record<string, true | string>;
const Ctx = createContext<{ errors: Errors; recheck: (name: string) => void }>({ errors: {}, recheck: () => {} });

function problem(el: Field): true | string | undefined {
  const v = el.validity;
  if (v.valid) return undefined;
  if (v.valueMissing) return true;
  // A field's `title` states its rule, so it beats the generic messages below.
  if (el.title) return el.title;
  if (v.tooShort && "minLength" in el) return `حداقل ${el.minLength.toLocaleString("fa-IR")} حرف وارد کنید.`;
  if (v.typeMismatch && el.type === "email") return "ایمیل معتبر وارد کنید، مثال: name@example.com";
  return "مقدار واردشده درست نیست.";
}

function check(el: Field) {
  const p = problem(el);
  el.setAttribute("aria-invalid", String(!!p));
  return p;
}

/** A form that shows its own Persian messages (via <FieldError>) instead of the browser's validation bubbles. */
export function ValidatedForm({ children, ...props }: React.ComponentProps<"form">) {
  const [errors, setErrors] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);

  /** Once a field has been flagged, its message updates (or clears) as its value changes. */
  function recheck(name: string) {
    const el = form.current?.elements.namedItem(name);
    if (!el || !("validity" in el)) return;
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const p = check(el as Field);
      if (p === prev[name]) return prev;
      const next = { ...prev };
      if (p) next[name] = p;
      else delete next[name];
      return next;
    });
  }

  return (
    <form
      {...props}
      ref={form}
      noValidate
      onSubmit={(e) => {
        const next: Errors = {};
        for (const el of e.currentTarget.elements as unknown as Field[]) {
          if (!el.name || !("validity" in el)) continue;
          const p = check(el);
          if (p && !(el.name in next)) next[el.name] = p;
        }
        setErrors(next);
        if (Object.keys(next).length) {
          e.preventDefault(); // React then skips the server action
          e.currentTarget.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
        }
      }}
      onInput={(e) => recheck((e.target as Field).name)}
    >
      <Ctx value={{ errors, recheck }}>{children}</Ctx>
    </form>
  );
}

/** Lets a field whose value changes without an input event (like a picked combobox option) clear its message. */
export const useRecheck = () => useContext(Ctx).recheck;

/** The message for one field of the surrounding <ValidatedForm>; renders nothing elsewhere. */
export function FieldError({ name, label }: { name: string; label: string }) {
  const error = useContext(Ctx).errors[name];
  if (!error) return null;
  return (
    <span role="alert" className="mt-1.5 block text-xs font-medium text-danger">
      {error === true ? `${label} را وارد کنید.` : error}
    </span>
  );
}
