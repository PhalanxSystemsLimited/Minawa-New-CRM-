// Attendance (23 Nov 2026). Everyone whose attendance is kept is an employee: field staff (gardeners, cleaners,
// guards…) and building managers / accountants linked to their CRM login. Each employee has a personal attendance
// link (a long random code). Opening it the first time registers their phone (a passkey, unlocked by the phone's
// fingerprint), which the building manager approves (the Admin for managers and accountants). After that a check-in
// or check-out counts only when:
//   · the fingerprint unlocks that phone's passkey (checked on the server), and
//   · the phone is inside one of their buildings' office areas (a point and a radius set by the Admin) with a
//     location accurate enough (the Admin's limit).
// Refused attempts can be sent to the manager ("Ask manager"); an approved one is saved as a manual mark.
// Who hears about whom (the chain): field staff → their buildings' managers; a manager → the accountants of their
// buildings and the Admin; an accountant → the Admin. Leaving the area early (and, with the Android app, leaving it
// during the shift) goes to the whole chain above the person.
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { Employee, AttRecord, AttRequest, AttAlert, AttStatus, AttArea, AttPlace, Staff, Rules, Project } from './types';
import { getStore } from './store';
import { addDays, todayPKT, nowPKT, dow, t12, fd } from './fmt';
import { fmtStaffNo, staffNos } from './people';
import { canOpen, ROLE_NAMES } from './session';

export const DESIGNATIONS = ['Gardener', 'Cleaner', 'Sweeper', 'Guard', 'Electrician', 'Plumber', 'Lift operator', 'Generator operator', 'Driver', 'Supervisor', 'Office boy', 'Building manager', 'Accountant', 'Other'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---------- the Admin's settings per building ---------- */
export interface AttSettings { area: AttArea | null; acc: number; grace: number }
export const DEF_RADIUS = 100, DEF_ACC = 50, DEF_GRACE = 15;
export function attSettings(r: Partial<Rules> | null | undefined): AttSettings {
  const a = r?.attArea, ok = !!a && Number.isFinite(+a.lat) && Number.isFinite(+a.lng) && Math.abs(+a.lat) <= 90 && Math.abs(+a.lng) <= 180 && +a.radius > 0;
  const n = (v: unknown, d: number, lo: number, hi: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && v != null && v !== '' ? Math.max(lo, Math.min(hi, x)) : d; };
  return { area: ok ? { lat: +a!.lat, lng: +a!.lng, radius: Math.max(20, Math.min(2000, Math.round(+a!.radius))) } : null, acc: n(r?.attAcc, DEF_ACC, 10, 500), grace: n(r?.attGrace, DEF_GRACE, 0, 180) };
}
/** Reads a point from what the Admin pasted: "24.8607, 67.0011", or a full Google Maps link (…/@24.86,67.00,17z,
 *  ?q=24.86,67.00, ?ll=…, !3d24.86!4d67.00). Short share links (maps.app.goo.gl) carry no numbers: null. */
export function parsePoint(text: string): { lat: number; lng: number } | null {
  const s = decodeURIComponent(String(text || '').trim());
  const pats = [/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/];
  for (const p of pats) { const m = p.exec(s); if (m) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; } }
  return null;
}
export const mapsLink = (p: { lat: number; lng: number }) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
/** Metres between two points (haversine). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
export const distText = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;

/* ---------- employees ---------- */
export const newToken = () => randomBytes(18).toString('base64url');
/** The next employee ID after everyone's (employees and staff logins share EMP-0001…). */
export function nextEmpNo(emps: Employee[], staff: Staff[]) {
  const n = (x: string | null | undefined) => { const m = /(\d+)$/.exec(x || ''); return m ? +m[1] : 0; };
  const max = Math.max(0, ...emps.map(e => n(e.empNo)), ...[...staffNos(staff).map.values()].map(n));
  return fmtStaffNo(max + 1);
}
export type EmpRole = 'field' | 'manager' | 'accountant' | 'admin';
export const roleOf = (e: Employee, staff: Staff[]): EmpRole => (e.staffId && staff.find(s => s.id === e.staffId)?.role) || 'field';
export const ROLE_WORD: Record<EmpRole, string> = { field: 'Field staff', manager: ROLE_NAMES.manager, accountant: ROLE_NAMES.accountant, admin: ROLE_NAMES.admin };
const opens = (s: Staff, e: Employee) => e.projects.some(p => canOpen(s, p));
/** Who may see this employee's attendance: the Admin everyone; an accountant field staff and managers of their
 *  buildings; a building manager the field staff of his buildings. Everyone sees their own. */
export function canSee(v: Staff, e: Employee, staff: Staff[]) {
  if (v.role === 'admin' || e.staffId === v.id) return true;
  const r = roleOf(e, staff);
  if (v.role === 'accountant') return (r === 'field' || r === 'manager') && opens(v, e);
  return r === 'field' && e.projects.some(p => (v.projects || []).includes(p));
}
/** Who approves this employee's phone and "Ask manager" requests: the building manager for field staff (and the
 *  Admin); the Admin for managers and accountants. */
export function canApprove(v: Staff, e: Employee, staff: Staff[]) {
  if (e.staffId === v.id) return false;
  if (v.role === 'admin') return true;
  return v.role === 'manager' && roleOf(e, staff) === 'field' && e.projects.some(p => (v.projects || []).includes(p));
}
/** Who hears about this employee. 'chain': everyone above them (leaving early, leaving the area); 'near': the
 *  person just above (check-ins, not checked in yet). */
export function watchers(e: Employee, staff: Staff[], kind: 'near' | 'chain'): Staff[] {
  const r = roleOf(e, staff), act = staff.filter(s => s.active && s.id !== e.staffId);
  const mgr = act.filter(s => s.role === 'manager' && e.projects.some(p => (s.projects || []).includes(p)));
  const acc = act.filter(s => s.role === 'accountant' && opens(s, e)), adm = act.filter(s => s.role === 'admin');
  if (r === 'field') return kind === 'near' ? mgr : [...mgr, ...acc, ...adm];
  if (r === 'manager') return [...acc, ...adm];
  return adm;
}

/* ---------- working hours ---------- */
export const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 0; };
export const crosses = (e: Pick<Employee, 'shiftStart' | 'shiftEnd'>) => mins(e.shiftEnd) <= mins(e.shiftStart);
export const shiftText = (e: Pick<Employee, 'shiftStart' | 'shiftEnd'>) => `${t12(e.shiftStart)} – ${t12(e.shiftEnd)}${crosses(e) ? ' (next day)' : ''}`;
export const offText = (e: Pick<Employee, 'offDays'>) => e.offDays.length ? e.offDays.map(d => DAYS[d]).join(', ') : 'No weekly off';
export const isOff = (e: Employee, d: string) => e.offDays.includes(new Date(d + 'T00:00:00Z').getUTCDay());
/** The working day a moment belongs to: a night shift's early hours (before it ends, plus an hour) count on the day it started. */
export const workDay = (e: Employee, d: string, t: string) => crosses(e) && mins(t) < mins(e.shiftEnd) + 60 ? addDays(d, -1) : d;
/** Minutes after the start of the shift (a night shift's early hours count on). */
export function minsLate(e: Employee, day: string, d: string, t: string) { return mins(t) - mins(e.shiftStart) + (d > day ? 1440 : 0); }
/** When the shift of `day` ends: "YYYY-MM-DD HH:MM". */
export const shiftEndAt = (e: Employee, day: string) => `${crosses(e) ? addDays(day, 1) : day} ${e.shiftEnd}`;
export const shiftStartAt = (e: Employee, day: string) => `${day} ${e.shiftStart}`;
const plusMins = (at: string, n: number) => { const d = at.slice(0, 10), m = mins(at.slice(11)) + n; const dd = addDays(d, Math.floor(m / 1440)), mm = ((m % 1440) + 1440) % 1440; return `${dd} ${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
export const nowAt = () => `${todayPKT()} ${nowPKT()}`;

/* ---------- a day's status ---------- */
export type DayKey = AttStatus | 'waiting' | 'notmarked' | 'future' | 'before' | 'in';
export interface DayView { key: DayKey; label: string; tone: 'good' | 'warn' | 'bad' | 'info' | 'muted'; marked: boolean }
export const STATUS_LABEL: Record<AttStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent', leave: 'On leave', off: 'Off', half: 'Half day' };
const TONE: Record<AttStatus, DayView['tone']> = { present: 'good', late: 'warn', absent: 'bad', leave: 'info', off: 'muted', half: 'warn' };
/** The first day that counts: the day they joined, or else the day they were added to the CRM. */
export const startDay = (e: Employee) => e.joined || (e.createdAt && Number.isFinite(Date.parse(e.createdAt)) ? new Date(Date.parse(e.createdAt) + 5 * 3600e3).toISOString().slice(0, 10) : null);
/** What a day looks like for an employee: their record, or what it is without one (off day, not marked yet, absent). */
export function dayView(e: Employee, d: string, rec: AttRecord | null | undefined, now: string, grace: number): DayView {
  if (rec) return { key: rec.status, label: STATUS_LABEL[rec.status], tone: TONE[rec.status], marked: ['present', 'late', 'half'].includes(rec.status) };
  const from = startDay(e);
  if (from && d < from) return { key: 'before', label: '—', tone: 'muted', marked: false };
  if (isOff(e, d)) return { key: 'off', label: 'Off', tone: 'muted', marked: false };
  const start = shiftStartAt(e, d), end = shiftEndAt(e, d);
  if (start > now) return { key: d > now.slice(0, 10) ? 'future' : 'waiting', label: d > now.slice(0, 10) ? '' : 'Shift not started', tone: 'muted', marked: false };
  if (end <= now) return { key: 'absent', label: 'Absent', tone: 'bad', marked: false };
  if (plusMins(start, grace) > now) return { key: 'waiting', label: 'Not marked yet', tone: 'muted', marked: false };
  return { key: 'notmarked', label: 'Not marked yet', tone: 'warn', marked: false };
}
/** One letter per day on the month sheet. */
export const LETTER: Record<string, string> = { present: 'P', late: 'L', absent: 'A', leave: 'Lv', off: 'O', half: 'H', notmarked: '·', waiting: '', future: '', before: '' };
/** Totals for a set of days. */
export function totals(views: DayView[]) {
  const t = { present: 0, late: 0, absent: 0, leave: 0, off: 0, half: 0 };
  for (const v of views) if (v.key in t) t[v.key as keyof typeof t]++;
  return t;
}

/* ---------- data for the screens ---------- */
export interface AttCtx {
  staff: Staff[]; employees: Employee[]; projects: Project[]; settings: Record<string, AttSettings>;
  today: string; now: string;
}
export async function attCtx(): Promise<AttCtx> {
  const store = await getStore();
  const [staff, employees, projects] = await Promise.all([store.listStaff(), store.listEmployees(), store.listProjects()]);
  const sets = await Promise.all(projects.map(p => store.getSettings(p.id).then(s => [p.id, attSettings(s.rules)] as const)));
  return { staff, employees, projects, settings: Object.fromEntries(sets), today: todayPKT(), now: nowAt() };
}
/** The grace minutes for an employee (their first building's). */
export const graceOf = (c: AttCtx, e: Employee) => c.settings[e.projects[0]]?.grace ?? DEF_GRACE;
export const pname = (c: AttCtx, pid: string) => c.projects.find(p => p.id === pid)?.name || pid;

/* ---------- checking in and out ---------- */
export type MarkResult = { ok: true; rec: AttRecord; msg: string } | { ok: false; reason: string; place: AttPlace | null; project: string | null; askable: boolean };
/** The nearest of the employee's office areas to a point. */
export function nearest(c: AttCtx, e: Employee, p: { lat: number; lng: number }) {
  let best: { pid: string; dist: number; area: AttArea } | null = null;
  for (const pid of e.projects) { const a = c.settings[pid]?.area; if (!a) continue; const dist = metres(a, p); if (!best || dist < best.dist) best = { pid, dist, area: a }; }
  return best;
}
/** Checks the place (fingerprint already checked) and saves the check-in or check-out. */
export async function mark(c: AttCtx, e: Employee, kind: 'checkin' | 'checkout', loc: { lat: number; lng: number; acc: number }, how: 'fingerprint' | 'app'): Promise<MarkResult> {
  const store = await getStore(), d = c.today, t = c.now.slice(11);
  if (!e.active) return { ok: false, reason: 'This attendance link is switched off. Ask your manager.', place: null, project: null, askable: false };
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return { ok: false, reason: 'Your phone did not give its location. Turn on Location and try again.', place: null, project: null, askable: false };
  const near = nearest(c, e, loc);
  if (!near) return { ok: false, reason: 'The office point for your building is not set yet (Admin: Settings › Attendance).', place: null, project: e.projects[0] || null, askable: true };
  const place: AttPlace = { lat: +loc.lat.toFixed(6), lng: +loc.lng.toFixed(6), acc: Math.round(loc.acc || 0), dist: near.dist }, accMax = c.settings[near.pid].acc;
  if (place.acc > accMax) return { ok: false, reason: `Your location is not accurate enough (±${place.acc} m; the limit is ${accMax} m). Move near a window or outside and try again.`, place, project: near.pid, askable: true };
  if (near.dist > near.area.radius) return { ok: false, reason: `You are ${distText(near.dist)} from ${pname(c, near.pid)}'s office point (allowed: ${near.area.radius} m). Check in from inside the building.`, place, project: near.pid, askable: true };
  const day = workDay(e, d, t), recs = await store.listAttendance({ from: addDays(day, -1), to: day, employeeIds: [e.id] });
  const at = `${d} ${t}`;
  if (kind === 'checkin') {
    const ex = recs.find(r => r.d === day);
    if (ex?.inAt) return { ok: false, reason: `You already checked in at ${t12(ex.inAt.slice(11))}.`, place, project: near.pid, askable: false };
    const late = minsLate(e, day, d, t) > (c.settings[e.projects[0]]?.grace ?? DEF_GRACE);
    const rec: AttRecord = { id: `${e.id}:${day}`, employeeId: e.id, project: near.pid, d: day, status: late ? 'late' : 'present', inAt: at, outAt: null, inPlace: place, outPlace: null, how, byName: null, note: ex?.note || null };
    await store.saveAttendance(rec);
    return { ok: true, rec, msg: `Checked in at ${t12(t)}${late ? ' (late)' : ''} · ${pname(c, near.pid)}` };
  }
  const open = recs.filter(r => r.inAt && !r.outAt).sort((a, b) => b.d.localeCompare(a.d))[0];
  if (!open) return { ok: false, reason: 'You have not checked in today, so there is nothing to check out from.', place, project: near.pid, askable: false };
  const rec: AttRecord = { ...open, outAt: at, outPlace: place };
  await store.saveAttendance(rec);
  const end = shiftEndAt(e, open.d), early = at < end;
  if (early) await alertChain(c, e, open.project, open.d, 'early_out', `checked out at ${t12(t)}, before the shift ends (${t12(e.shiftEnd)})`, place);
  return { ok: true, rec, msg: `Checked out at ${t12(t)}${early ? ' (before the shift ends)' : ''}` };
}
/** Saves an alert for the chain (leaving early; the Android app: left the area, back, location off). */
export async function alertChain(c: AttCtx, e: Employee, project: string, d: string, kind: AttAlert['kind'], text: string, place: AttPlace | null) {
  await (await getStore()).saveAttAlert({ id: `AL-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, employeeId: e.id, project, d, at: new Date().toISOString(), kind, text, place });
}

/* ---------- activity log ---------- */
export async function attLog(project: string | null, text: string, by: Staff | null) {
  await (await getStore()).appendLog([{ id: `ATT-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`, project, d: todayPKT(), t: nowPKT(), kind: 'attendance', text, ownerId: null, staffId: by?.id || null, by: by?.name || null }]);
}

/* ---------- signed tickets (challenges, "Ask manager") ---------- */
const SECRET = () => createHash('sha256').update('minawa-attendance:' + (process.env.ATT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-only')).digest();
export function sign(o: object, seconds: number) {
  const body = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + seconds * 1000 })).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET()).update(body).digest('base64url')}`;
}
export function unsign<T>(tok: string | null | undefined): T | null {
  const [body, mac] = String(tok || '').split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', SECRET()).update(body).digest();
  let got: Buffer; try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const o = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number }; return o.exp > Date.now() ? o : null; } catch { return null; }
}

/* ---------- words ---------- */
export const when = (at: string | null | undefined) => at ? t12(at.slice(11)) : '';
export const dayWords = (d: string) => `${dow(d)} ${fd(d)}`;
