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
