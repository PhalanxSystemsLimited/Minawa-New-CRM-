// Dates, money and text helpers, the same as the demo's.
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY = 864e5;

export const utc = (s: string) => { const a = s.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); };
export const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => isoOf(utc(s) + n * DAY);
export const diff = (a: string, b: string) => Math.round((utc(a) - utc(b)) / DAY);
export const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const fd = (s: string) => { const a = s.split('-'); return `${+a[2]} ${MON[+a[1] - 1]} ${a[0]}`; };
export const fds = (s: string) => { const a = s.split('-'); return `${+a[2]} ${MON[+a[1] - 1]}`; };
export const fm = (p: string) => { const a = p.split('-'); return `${MONL[+a[1] - 1]} ${a[0]}`; };
export const fmShort = (p: string) => { const a = p.split('-'); return `${MON[+a[1] - 1]}-${a[0]}`; };
export const dow = (s: string) => DOW[new Date(utc(s)).getUTCDay()];
export const dowl = (s: string) => DOWL[new Date(utc(s)).getUTCDay()];
export const rs = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-US');
export const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const first = (n: string) => n.split(' ')[0];
export const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
export const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
export const short = (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'k';
export function prevMonth(p: string) { let y = +p.slice(0, 4), m = +p.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; }
export function nextMonth(p: string) { let y = +p.slice(0, 4), m = +p.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
export const waDigits = (n: string) => String(n || '').replace(/\D/g, '');

// Today in Pakistan (UTC+5), unless APP_TODAY pins it (staging, tests, the sample data).
export function todayPKT(): string {
  const pin = process.env.APP_TODAY;
  if (pin && /^\d{4}-\d{2}-\d{2}$/.test(pin)) return pin;
  return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
}
export function nowPKT(): string {
  const d = new Date(Date.now() + 5 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "14:05" → "2:05 PM" (times are stored as 24-hour "HH:MM" so they sort; shown in 12-hour time). */
export function t12(t: string | null | undefined) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t || '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
/** The hour the daily run goes out, e.g. 11 → "11:00 AM". */
export const hour12 = (h: number) => t12(`${h}:00`);
/** Month p moved by n months ("2026-11", 2 → "2027-01"). */
export function addMonths(p: string, n: number) { const t = +p.slice(0, 4) * 12 + (+p.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; }
/** Whole months from month a to month b ("2026-11" → "2027-01" is 2). */
export const monthsBetween = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
/** Day `day` of month p, or the month's last day when it is shorter ("2027-02", 31 → "2027-02-28"). */
export const dayIn = (p: string, day: number) => `${p}-${String(Math.min(day, dim(+p.slice(0, 4), +p.slice(5, 7)))).padStart(2, '0')}`;

/** The months a payment is for (26 Nov 2026): "November 2026", "Oct – Dec 2026", "Nov 2026 – Jan 2027". */
export function periodText(from?: string | null, to?: string | null) {
  if (!from || !/^\d{4}-\d{2}$/.test(from)) return '';
  const t = to && /^\d{4}-\d{2}$/.test(to) && to > from ? to : from, m = (p: string) => MON[+p.slice(5, 7) - 1];
  if (t === from) return fm(from);
  return from.slice(0, 4) === t.slice(0, 4) ? `${m(from)} – ${m(t)} ${t.slice(0, 4)}` : `${m(from)} ${from.slice(0, 4)} – ${m(t)} ${t.slice(0, 4)}`;
}
/** Months between two 'YYYY-MM' (inclusive). */
export const monthsIn = (from: string, to: string) => (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1;
