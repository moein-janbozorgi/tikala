"use client";

import { useId, useState } from "react";

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
          autoComplete="off"
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
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`pointer-events-none absolute inset-e-3 top-1/2 size-4 -translate-y-1/2 text-muted transition ${show ? "rotate-180" : ""}`}>
          <path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
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
      {hint && typed && !known.includes(typed) ? <p className="mt-1 text-xs text-muted">{hint(typed)}</p> : null}
    </div>
  );
}
