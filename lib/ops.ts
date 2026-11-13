// Loading a project for a screen, and changing it safely (lock, load, change, save, send).
import type { State, Staff, Project, LogEntry } from './types';
import { getStore } from './store';
import { use, runDaily, setTarget, log, at } from './engine';
import { dispatch, checkSafepay } from './dispatch';
import { todayPKT, addDays, nowPKT } from './fmt';
import { staffName } from './session';

export async function projects(): Promise<Project[]> { return (await getStore()).listProjects(); }
export async function liveProjects() { return (await projects()).filter(p => p.live); }

export async function load(pid: string, staff?: Staff | null): Promise<State> {
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
export async function mutate<T>(pid: string, staff: Staff | null, fn: (s: State) => T, opts: { send?: boolean; what?: string | ((s: State, out: T) => string | null) } = {}): Promise<T> {
  const store = await getStore();
  return store.withLock(async () => {
    const s = await load(pid, staff), before = s.log.length;
    const out = use(s, () => fn(s));
    if (staff && opts.what && s.log.length === before) {
      const what = opts.what;
      use(s, () => { const text = typeof what === 'function' ? what(s, out) : what; if (text) log(s.today, at(15), 'admin', text); });
    }
    s.staffId = null;   // what the dispatcher logs next (sending, Safepay) is the system's
    await store.saveState(s);
    if (opts.send !== false) { await dispatch(s); await store.saveState(s); }
    return out;
  });
}

/** The daily run for every live project, catching up any days that were missed. */
export async function runDailyAll(staff?: Staff | null) {
  const store = await getStore(), today = todayPKT(), out: Record<string, unknown> = {};
  for (const p of await liveProjects()) {
    out[p.id] = await store.withLock(async () => {
      const s = await load(p.id, staff);
      s.staffId = null;   // reminders, fines and flags are the system's, even when an admin starts the run
      const last = s.settings.lastRun || addDays(today, -1);
      const days: string[] = [];
      for (let d = addDays(last, 1); d <= today; d = addDays(d, 1)) days.push(d);
      const counts = days.map(d => use(s, () => { s.today = d; return runDaily(d); }));
      s.today = today;
      if (!s.settings.targets[today.slice(0, 7)]) use(s, () => setTarget(today.slice(0, 7)));
      s.settings.lastRun = today;
      await store.saveState(s);
      await checkSafepay(s);
      const sent = await dispatch(s);
      await store.saveState(s);
      return { days, counts, sent };
    });
  }
  return out;
}

/** Every few minutes: missed Safepay payments, then anything still queued. */
export async function dispatchAll() {
  const store = await getStore(), out: Record<string, unknown> = {};
  for (const p of await liveProjects()) {
    out[p.id] = await store.withLock(async () => {
      const s = await load(p.id, null);
      const paid = await checkSafepay(s);
      const sent = await dispatch(s);
      await store.saveState(s);
      return { paid, sent };
    });
  }
  return out;
}

/** Asks Safepay about every open payment link (all live projects) and records the ones that were paid. Used by the
 *  "Check Safepay payments" button and when a Safepay webhook can't be matched to a link. */
export async function sweepSafepay(staff: Staff | null) {
  const store = await getStore(), report: string[] = [];
  let paid = 0;
  for (const p of await liveProjects()) {
    paid += await store.withLock(async () => {
      const s = await load(p.id, staff);
      s.staffId = null;
      const ids = await checkSafepay(s, report);
      if (!ids.length) return 0;
      await store.saveState(s);
      await dispatch(s);
      await store.saveState(s);
      return ids.length;
    });
  }
  return { paid, report };
}
