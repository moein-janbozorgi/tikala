"use client";

import { createContext, useContext, useRef, useState } from "react";
import { normalizePhone, toPersianDigits } from "@/lib/phone";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
// Per field name: true = left empty, a string = a ready message for any other problem.
type Errors = Record<string, true | string>;
const Ctx = createContext<{ errors: Errors; recheck: (name: string) => void }>({ errors: {}, recheck: () => {} });

// data-check="<name>": a rule shared with the server, which the HTML attributes can't express.
const CHECKS: Record<string, (el: Field) => string | undefined> = {
  phone: (el) => (!el.value || normalizePhone(el.value) ? undefined : "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)"),
  // Same 5 MB per file as MAX_UPLOAD_BYTES (lib/uploads.ts, server-only), and 25 MB for all the form's photos together
  // (next.config.ts allows 30 MB per request). Bigger files would otherwise hit the request size limit.
  image: (el) => {
    const files = [...((el as HTMLInputElement).files ?? [])];
    if (files.some((f) => f.size > 5 * 1024 * 1024)) return "حجم هر تصویر باید حداکثر ۵ مگابایت باشد";
    const all = [...(el.form?.querySelectorAll<HTMLInputElement>('input[type="file"]') ?? [])].flatMap((i) => [...(i.files ?? [])]);
    if (all.reduce((sum, f) => sum + f.size, 0) > 25 * 1024 * 1024) return "حجم همه تصویرها با هم باید حداکثر ۲۵ مگابایت باشد";
  },
};

function problem(el: Field): true | string | undefined {
  const v = el.validity;
  if (v.valueMissing) return true;
  const custom = el.dataset.check && CHECKS[el.dataset.check]?.(el);
  if (custom) return custom;
  // data-match="password": this field must repeat that one (a password confirmation).
  const other = el.dataset.match && el.form?.elements.namedItem(el.dataset.match);
  if (other && "value" in other && other.value !== el.value) return el.dataset.matchMessage ?? "مقدار تکرار یکسان نیست.";
  if (v.valid) return undefined;
  // A field's `title` states its rule, so it beats the generic messages below.
  if (el.title) return el.title;
  if (v.tooShort && "minLength" in el) return `حداقل ${el.minLength.toLocaleString("fa-IR")} حرف وارد کنید.`;
  if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch) return `عددی صحیح بین ${Number((el as HTMLInputElement).min).toLocaleString("fa-IR")} تا ${Number((el as HTMLInputElement).max).toLocaleString("fa-IR")} وارد کنید.`;
  if (v.badInput) return "فقط عدد وارد کنید.";
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
      onInput={(e) => {
        const el = e.target as Field;
        // Phone, postal-code and SMS-code fields show digits typed on an English keyboard in Persian; the server reads both.
        if (el instanceof HTMLInputElement && (el.inputMode === "tel" || el.inputMode === "numeric") && /[0-9]/.test(el.value)) {
          const { selectionStart, selectionEnd } = el;
          el.value = toPersianDigits(el.value); // same length, so the caret can be put back where it was
          el.setSelectionRange(selectionStart, selectionEnd);
        }
        const { name } = el;
        recheck(name);
        // Editing a password also re-judges its confirmation.
        e.currentTarget.querySelectorAll<Field>(`[data-match="${name}"]`).forEach((el) => recheck(el.name));
      }}
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
