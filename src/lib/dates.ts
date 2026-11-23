const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number): string => String(n).padStart(2, "0");

/** Google Tasks `due` is a date at UTC midnight; the date is the first 10 chars. */
export function dueToYmd(due: string): string {
  return due.slice(0, 10);
}

export function ymdToDue(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

/** Local calendar date of `now` as YYYY-MM-DD. */
export function todayYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dueState(due: string, today: string): "overdue" | "today" | "future" {
  const d = dueToYmd(due);
  if (d < today) return "overdue";
  return d === today ? "today" : "future";
}

function addDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function formatDue(due: string, today: string): string {
  const d = dueToYmd(due);
  if (d === today) return "Today";
  if (d === addDay(today)) return "Tomorrow";
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}
