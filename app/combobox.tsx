"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDownIcon } from "./icons";
import { FieldError, useRecheck } from "./validated-form";

/** Text input with a filtered suggestion list. `hint` explains a value that is not one of the options. */
export function Combobox({
  name,
  label,
  extra,
  placeholder,
  hint,
  required,
  options: known,
  value,
  onChange,
}: {
  name: string;
  label: string;
  extra?: React.ReactNode;
  placeholder?: string;
  hint?: (typed: string) => React.ReactNode;
  required?: boolean;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const recheck = useRecheck();
  useEffect(() => recheck(name), [recheck, name, value]);

  const typed = value.trim();
  // An exact match lists everything so the user can switch; otherwise filter by what was typed.
  const options = known.includes(typed) ? known : known.filter((t) => t.includes(typed));
  const show = open && options.length > 0;

  function pick(t: string) {
    onChange(t);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm font-medium">
        <label htmlFor={id}>{label}</label>
        {extra}
      </div>
      <div className="relative">
        <input
          id={id}
          name={name}
          value={value}
          placeholder={placeholder}
          required={required}
          maxLength={40}
          // Chrome ignores "off" on address-like fields (city, province); an unknown token does turn its autofill popup off.
          autoComplete="combobox-no-autofill"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={`${id}-list`}
          aria-activedescendant={show && active >= 0 ? `${id}-${active}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length) {
              e.preventDefault();
              setOpen(true);
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a + step + options.length) % options.length);
            } else if (e.key === "Enter" && show && active >= 0) {
              e.preventDefault(); // pick the option instead of submitting the form
              pick(options[active]);
            } else if (e.key === "Escape" && show) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          className="input pe-9"
        />
        <ChevronDownIcon className={`pointer-events-none absolute inset-e-3 top-1/2 size-4 -translate-y-1/2 text-muted transition ${show ? "rotate-180" : ""}`} />
        {show ? (
          <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-60 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
            {options.map((t, i) => (
              <li
                key={t}
                id={`${id}-${i}`}
                role="option"
                aria-selected={t === typed}
                // Keep focus in the input so blur does not close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""} ${t === typed ? "font-bold" : ""}`}
              >
                {t}
                {t === typed ? <span aria-hidden className="text-accent">✓</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <FieldError name={name} label={label} />
      {hint && typed && !known.includes(typed) ? <p className="mt-1 text-xs text-muted">{hint(typed)}</p> : null}
    </div>
  );
}
