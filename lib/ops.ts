// Loading a project for a screen, and changing it safely (lock, load, change, save, send).
import type { State, Staff, Project, LogEntry } from './types';
import { getStore } from './store';
import { use, runDaily, setTarget, log, at } from './engine';
import { dispatch } from './dispatch';
import { todayPKT, addDays, nowPKT, rs, hour12 } from './fmt';
import { staffName, canOpen } from './session';

/** The projects (buildings) a person may see: all of them, or a Building manager's assigned ones. */
export async function projects(staff?: Staff | null): Promise<Project[]> { return (await (await getStore()).listProjects()).filter(p => canOpen(staff, p.id)); }
export async function liveProjects(staff?: Staff | null) { return (await projects(staff)).filter(p => p.live); }

export async function load(pid: string, staff?: Staff | null): Promise<State> {
  if (!canOpen(staff, pid)) throw new Error('This building isn\'t assigned to you.');
  const store = await getStore();
  const s = await store.loadState(pid, { today: todayPKT(), by: staff ? staffName(staff) : 'System', role: staff?.role || 'admin' });
  s.staffId = staff?.id || null; s.staffName = staff ? staffName(staff) : null;
  return s;
}

/** A log entry for something a staff member did outside a project's engine (sign-in, staff, company, templates). */
export async function staffLog(staff: Staff | null, text: string, o: { kind?: string; project?: string | null } = {}) {
  const e: LogEntry = { id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), project: o.project ?? null, d: todayPKT(), t: nowPKT(), kind: o.kind || 'admin', text,
    ownerId: null, staffId: staff?.id || null, by: staff ? staffName(staff) : null };
  try { await (await getStore()).appendLog([e]); } catch (err) { console.error('activity log', err); }
}

/** Lock, load the project, run fn on it (synchronously, inside the engine), save, then send what fn queued.
 *  Log entries made by fn carry the staff member; `what` describes the action when fn logs nothing itself. */
export async function mutate<T>(pid: string, staff: Staff | null, fn: (s: State) => T, opts: { send?: boolean; what?: string | ((s: State, out: T) => string | null); manager?: boolean } = {}): Promise<T> {
  // 25 Nov 2026: a building manager only enters payments and sends their receipts. Every other change refuses him
  // here, whatever screen or old link it comes from (the few allowed actions pass manager: true).
  if (staff?.role === 'manager' && !opts.manager) throw new Error('Building managers only enter payments and send the receipt. Ask your accountant.');
  const store = await getStore();
  return store.withLock(async () => {
    const s = await load(pid, staff), before = s.log.length;
    const out = use(s, () => fn(s));
    if (staff && opts.what && s.log.length === before) {
      const what = opts.what;
      use(s, () => { const text = typeof what === 'function' ? what(s, out) : what; if (text) log(s.today, at(15), 'admin', text); });
    }
    s.staffId = null;   // what the dispatcher logs next (sending) is the system's
    await store.saveState(s);
    if (opts.send !== false) { await dispatch(s); await store.saveState(s); }
    return out;
  });
}

/** The last day the daily run may cover now: today once it is the project's send hour (11:00 AM Pakistan time),
 *  otherwise yesterday. Bills on the 25th, reminders on the 3rd and 7th, fines and flags are made at that hour,
 *  not at midnight or whenever someone happens to open the CRM. Missed days are always caught up. */
export function runUpTo(s: State, today = todayPKT()) {
  const hour = +nowPKT().slice(0, 2);
  return hour >= (s.settings.rules.sendHour ?? 11) || process.env.APP_TODAY ? today : addDays(today, -1);
}

/** The daily run for every live project, catching up any days that were missed. */
export async function runDailyAll(staff?: Staff | null) {
  const store = await getStore(), today = todayPKT(), out: Record<string, unknown> = {};
  for (const p of await liveProjects()) {
    out[p.id] = await store.withLock(async () => {
      const s = await load(p.id, staff);
      s.staffId = null;   // reminders, fines and flags are the system's, even when an admin starts the run
      const last = s.settings.lastRun || addDays(today, -1), upto = runUpTo(s, today);
      const days: string[] = [];
      for (let d = addDays(last, 1); d <= upto; d = addDays(d, 1)) days.push(d);
      if (!days.length) return { days, counts: [], sent: 0, waiting: `today's run is at ${hour12(s.settings.rules.sendHour)}` };
      const counts = days.map(d => use(s, () => { s.today = d; return runDaily(d); }));
      s.today = today;
      if (!s.settings.targets[today.slice(0, 7)]) use(s, () => setTarget(today.slice(0, 7)));
      s.settings.lastRun = upto;
      await store.saveState(s);
      const sent = await dispatch(s);
      await store.saveState(s);
      return { days, counts, sent };
    });
  }
  return out;
}

/** The daily run without a scheduler: while anyone has the CRM open (checked from /api/live), each live project is run
 *  once a day (bills on each customer's billing date, reminders on the 3rd and 7th, fines, notices and flags), catching up any days that
 *  were missed. What it makes waits in To do and Send on WhatsApp, to be sent by hand. Checked at most once a minute;
 *  today's run waits until the project's send hour (11:00 AM). */
export async function autoDaily() {
  try {
    const store = await getStore(), today = todayPKT();
    // Once today's run is done everywhere, a marker held until midnight makes every later check stop here cheaply.
    if (!(await store.throttle(`daily-done-${today}`, 1))) return 0;
    if (!(await store.throttle(`daily-check-${today}`, 60))) return 0;
    const due = [];
    let allDone = true;
    for (const p of await liveProjects()) {
      const s = await load(p.id, null), upto = runUpTo(s, today);
      if ((s.settings.lastRun || '') < upto) due.push(p.id);
      if (upto < today) allDone = false;   // before 11:00 AM: today's run is still to come
    }
    if (due.length) await runDailyAll(null);
    if (allDone) { const [h, m] = nowPKT().split(':').map(Number); await store.throttle(`daily-done-${today}`, Math.max(60, (24 * 60 - h * 60 - m) * 60)); }
    return due.length;
  } catch (e) { console.error('daily run', (e as Error).message); return 0; }
}
