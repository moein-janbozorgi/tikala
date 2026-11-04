"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => print()} className="btn print:hidden">
      چاپ فاکتور
    </button>
  );
}
