// Attendance notifications (23 Nov 2026), worked out from the data like lib/notify.ts: check-ins and check-outs,
// people not checked in yet once their shift's grace time has passed, phones and "Ask manager" requests to approve,
// and alerts (left before the shift ended; with the Android app, left the area or location off). Each goes to the
// people the chain says (lib/attendance.ts). The counter on Attendance is how many of these arrived since the person
// last opened the Attendance screen (kept on the server, so it clears on every device at once).
import type { Staff, AttRecord, AttRequest, AttAlert, Employee } from './types';
import type { Note } from './notify';
import { getStore } from './store';
import { attCtx, watchers, canApprove, dayView, graceOf, pname, shiftStartAt, workDay, when, distText, nowAt, type AttCtx } from './attendance';
import { addDays, t12 } from './fmt';

/** An ISO moment as "YYYY-MM-DD HH:MM" in Pakistan time. */
export const pkt = (iso: string | null | undefined) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : ''; };
const plus = (at: string, n: number) => pkt(new Date(Date.parse(at.replace(' ', 'T') + ':00Z') - 5 * 3600e3 + n * 60e3).toISOString());
const SEEN = (id: string) => `attseen:${id}`;
const toNum = (at: string) => Number(at.replace(/\D/g, '').slice(0, 12)) || 0;
const fromNum = (n: number) => { const s = String(n); return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : ''; };

export interface AttFeed { ctx: AttCtx; recs: AttRecord[]; reqs: AttRequest[]; alerts: AttAlert[]; notes: Note[]; unseen: number; seen: string }

export async function attFeed(v: Staff): Promise<AttFeed> {
  const store = await getStore(), ctx = await attCtx(), y = addDays(ctx.today, -1);
  const [recs, reqs, alerts, seenN] = await Promise.all([
    ctx.employees.length ? store.listAttendance({ from: y, to: ctx.today }) : Promise.resolve([]),
    ctx.employees.length ? store.listAttRequests({ status: 'pending' }) : Promise.resolve([]),
    ctx.employees.length ? store.listAttAlerts({ since: y }) : Promise.resolve([]),
    store.getNum(SEEN(v.id))]);
  const notes = attNotes(v, ctx, recs, reqs, alerts), seen = fromNum(seenN);
  return { ctx, recs, reqs, alerts, notes, seen, unseen: notes.filter(n => n.at > seen).length };
}
export async function markAttSeen(v: Staff) { const s = await getStore(); await s.setNum(SEEN(v.id), toNum(nowAt())); }

export function attNotes(v: Staff, c: AttCtx, recs: AttRecord[], reqs: AttRequest[], alerts: AttAlert[]): Note[] {
  const out: Note[] = [], emp = new Map(c.employees.map(e => [e.id, e]));
  const near = (e: Employee) => watchers(e, c.staff, 'near').some(s => s.id === v.id);
  const who = (e: Employee) => `${e.name} (${e.designation || 'staff'})`;
  for (const r of recs) {
    const e = emp.get(r.employeeId); if (!e || !near(e) || (r.how === 'manager' && r.byName === v.name)) continue;   // not your own hand marks
    if (r.inAt) out.push({ id: `attin:${r.id}`, at: r.inAt, tone: r.status === 'late' ? 'warn' : 'good', title: r.status === 'late' ? 'Late check-in' : 'Checked in', text: `${who(e)} · ${when(r.inAt)} · ${pname(c, r.project)}`, href: `/attendance?p=${r.project}` });
    if (r.outAt) out.push({ id: `attout:${r.id}`, at: r.outAt, tone: 'info', title: 'Checked out', text: `${who(e)} · ${when(r.outAt)} · ${pname(c, r.project)}`, href: `/attendance?p=${r.project}` });
  }
  // Not checked in once the grace time has passed: one notice per building and shift start.
  const miss = new Map<string, { at: string; pid: string; names: string[]; start: string }>();
  for (const e of c.employees) {
    if (!e.active || !near(e)) continue;
    const day = workDay(e, c.today, c.now.slice(11)), rec = recs.find(r => r.employeeId === e.id && r.d === day);
    if (dayView(e, day, rec, c.now, graceOf(c, e)).key !== 'notmarked') continue;
    const pid = e.projects[0] || '', k = `${pid}:${day}:${e.shiftStart}`, g = miss.get(k) || { at: plus(shiftStartAt(e, day), graceOf(c, e)), pid, names: [], start: e.shiftStart };
    g.names.push(e.name); miss.set(k, g);
  }
  for (const [k, g] of miss) out.push({ id: `attmiss:${k}`, at: g.at, tone: 'warn', title: `Not checked in yet · ${g.names.length}`, text: `${pname(c, g.pid)} · shift from ${t12(g.start)}: ${g.names.slice(0, 6).join(', ')}${g.names.length > 6 ? '…' : ''}`, href: `/attendance?p=${g.pid}&f=notmarked` });
  for (const e of c.employees) if (e.device?.status === 'pending' && canApprove(v, e, c.staff))
    out.push({ id: `attdev:${e.id}:${e.device.at}`, at: pkt(e.device.at), tone: 'warn', title: 'Phone to approve', text: `${who(e)} registered a phone (${e.device.label}). Approve it if it is theirs.`, href: `/attendance/people/${e.id}` });
  for (const r of reqs) {
    const e = emp.get(r.employeeId); if (!e || !canApprove(v, e, c.staff)) continue;
    out.push({ id: `attask:${r.id}`, at: `${r.d} ${r.t}`, tone: 'warn', title: r.kind === 'checkin' ? 'Asks you to mark check-in' : 'Asks you to mark check-out', text: `${who(e)} · ${t12(r.t)}${r.place ? ` · ${distText(r.place.dist)} from the office point` : ''}`, href: '/attendance?v=requests' });
  }
  for (const a of alerts) {
    const e = emp.get(a.employeeId); if (!e || !watchers(e, c.staff, 'chain').some(s => s.id === v.id)) continue;
    const title = a.kind === 'left' ? 'Left the office area' : a.kind === 'back' ? 'Back in the office area' : a.kind === 'signal_lost' ? 'Location off' : 'Left before the shift ended';
    out.push({ id: `attal:${a.id}`, at: pkt(a.at), tone: a.kind === 'back' ? 'good' : 'bad', title, text: `${who(e)} ${a.text} · ${pname(c, a.project)}`, href: `/attendance/people/${e.id}` });
  }
  return out.filter(n => n.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}
