const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse API dates; "YYYY-MM-DD..." is read as a calendar day so it never shifts across time zones. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateHaystack(value: string, displayed: string): string {
  const d = parseDateOnly(value);
  if (!d) return `${value} ${displayed}`.toLowerCase();
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const short = MONTHS_SHORT[d.getMonth()];
  const long = MONTHS_LONG[d.getMonth()];
  return [
    displayed,
    `${y}-${pad(mo)}-${pad(day)}`,
    `${pad(mo)}/${pad(day)}/${y}`,
    `${mo}/${day}/${y}`,
    `${pad(mo)}-${pad(day)}-${y}`,
    `${pad(day)}/${pad(mo)}/${y}`,
    `${short} ${day}, ${y}`,
    `${short} ${pad(day)}, ${y}`,
    `${long} ${day}, ${y}`,
    `${day} ${short} ${y}`,
    `${pad(day)} ${short} ${y}`,
    `${short} ${y}`,
    `${long} ${y}`,
    `${pad(mo)}/${y}`,
    `${mo}/${y}`,
    `${pad(mo)}-${y}`,
  ]
    .join(" | ")
    .toLowerCase();
}

/** Substring match against the displayed date plus common numeric and month-name variants. */
export function matchDate(query: string, value: string, displayed: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q || !value) return false;
  return dateHaystack(value, displayed).includes(q);
}

const normalizeAmount = (q: string) => q.replace(/[$€£¥₹,\s]/g, "").toLowerCase();

/** Prefix match on amount-shaped queries ("12" or "$1,2" finds 12.00, 125.50, 1200 — never 312). */
export function matchAmount(query: string, amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  const q = normalizeAmount(query.trim());
  if (!/^-?\d+(\.\d*)?$/.test(q)) return false;
  if (q.includes(".")) return amount.toFixed(2).startsWith(q) || String(amount).startsWith(q);
  return String(Math.trunc(amount)).startsWith(q);
}
