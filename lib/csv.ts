/**
 * Rows to CSV text. Every cell is quoted. A cell that starts with = + - @ (or a tab or CR) gets a leading ' so Excel shows
 * it as text instead of running it as a formula: names and addresses come from customers ("CSV injection").
 */
export function csv(rows: unknown[][]) {
  const cell = (value: unknown) => {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
