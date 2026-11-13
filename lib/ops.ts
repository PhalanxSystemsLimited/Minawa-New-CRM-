// Loading a project for a screen, and changing it safely (lock, load, change, save, send).
import type { State, Staff, Project, LogEntry } from './types';
import { getStore } from './store';
import { use, runDaily, setTarget, log, at, payLink, payStaleLink } from './engine';
import { safepayConfigured, safepayMode, getQuickLink } from './safepay';
import { dispatch, checkSafepay } from './dispatch';
import { todayPKT, addDays, nowPKT, rs } from './fmt';
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

/** Asks Safepay about the open payment links of every live project and records the ones that were paid. Safepay is
 *  asked outside the lock (several links at a time), so other work isn't held up; only recording a payment locks. */
export async function sweepSafepay(staff: Staff | null) {
  const report: string[] = [];
  if (!safepayConfigured()) return { paid: 0, report };
  const store = await getStore();
  let paid = 0;
  for (const p of await liveProjects()) {
    const s0 = await load(p.id, staff), since = addDays(s0.today, -30);
    const open = s0.links.filter(l => l.sp && !l.spSettled && (l.status === 'active' || (l.status === 'cancelled' && (l.cancelledOn || '') >= since)));
    const hits = new Map<string, string | null>();
    for (let i = 0; i < open.length; i += 6) {
      await Promise.all(open.slice(i, i + 6).map(async l => {
        try { const sp = await getQuickLink(l.sp!.id); report.push(`${l.id} (${rs(l.amount)}): ${sp.isPaid ? 'paid' : (sp.status || 'not paid').toLowerCase()}`); if (sp.isPaid) hits.set(l.id, sp.tracker); }
        catch (e) { report.push(`${l.id}: Safepay didn't answer (${(e as Error).message})`); }
      }));
    }
    if (!hits.size) continue;
    paid += await store.withLock(async () => {
      const s = await load(p.id, staff);
      s.staffId = null;   // recorded by the system, as confirmed by Safepay
      let n = 0;
      for (const [id, tracker] of hits) {
        const l = s.links.find(x => x.id === id);
        if (!l || !l.sp || l.spSettled) continue;
        l.sp.tracker = tracker || l.sp.tracker;
        use(s, () => l.status === 'active' ? payLink(l, 'Card', s.today, nowPKT(), safepayMode()) : payStaleLink(l, s.today, nowPKT(), safepayMode()));
        n++;
      }
      if (n) { await store.saveState(s); await dispatch(s); await store.saveState(s); }
      return n;
    });
  }
  return { paid, report };
}

/** Called while anyone has the CRM open (and by Safepay's webhook): checks Safepay at most once a minute. */
export async function autoSweep() {
  if (!safepayConfigured()) return 0;
  try {
    if (!(await (await getStore()).throttle('safepay-sweep', 60))) return 0;
    return (await sweepSafepay(null)).paid;
  } catch (e) { console.error('safepay sweep', (e as Error).message); return 0; }
}

/** The daily run without a scheduler: while anyone has the CRM open (checked from /api/live), each live project is run
 *  once a day (bills on the 25th, reminders on the 3rd and 7th, fines, notices and flags), catching up any days that
 *  were missed. What it makes waits in To do and Send on WhatsApp, to be sent by hand. Checked at most every 15 minutes. */
export async function autoDaily() {
  try {
    const store = await getStore(), today = todayPKT();
    if (!(await store.throttle(`daily-check-${today}`, 900))) return 0;
    const due = [];
    for (const p of await liveProjects()) { const s = await load(p.id, null); if ((s.settings.lastRun || '') < today) due.push(p.id); }
    if (!due.length) return 0;
    await runDailyAll(null);
    return due.length;
  } catch (e) { console.error('daily run', (e as Error).message); return 0; }
}
