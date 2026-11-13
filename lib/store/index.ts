// The data store. With Supabase settings in the environment it uses Supabase (production); without them it
// keeps everything in data/local-db.json, so the CRM runs on a laptop with the sample data and no setup.
import type { State, Project, LogEntry, Staff, Template, ProjectSettings, Role, Company, WaLog } from '../types';
import { STATE_TABLES, KEY, type TableName } from './tables';

export interface LoadOpts { today: string; by?: string; role?: Role }
/** staffIds: only what these people did; staffOnly: only what any staff member did (not the system). */
export interface LogQuery { project?: string | null; kinds?: string[] | null; limit?: number; staffIds?: string[] | null; staffOnly?: boolean }

/** WhatsApp confirmations: by project, by these staff, for one owner, only sent / not sent, from a date (ISODate). */
export interface WaLogQuery { project?: string | null; staffIds?: string[] | null; ownerId?: string | null; answer?: 'sent' | 'not_sent' | null; since?: string | null; limit?: number }

export interface Store {
  kind: 'supabase' | 'local';
  listProjects(): Promise<Project[]>;
  saveProject(p: Project): Promise<void>;
  loadState(pid: string, opts: LoadOpts): Promise<State>;
  saveState(s: State): Promise<void>;
  /** Every change to billing data runs inside this lock, so two writers never overwrite each other. */
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  getLog(opts: LogQuery): Promise<LogEntry[]>;
  appendLog(entries: LogEntry[]): Promise<void>;
  addWaLog(e: WaLog): Promise<void>;
  getWaLog(q: WaLogQuery): Promise<WaLog[]>;
  listStaff(): Promise<Staff[]>;
  saveStaff(s: Staff): Promise<void>;
  /** Where an owner (by WhatsApp digits), a payment link (by our id or Safepay's) or a WhatsApp message lives. */
  locate(q: { phoneDigits?: string; linkId?: string; spLinkId?: string; waId?: string; reference?: string }): Promise<{ project: string; id: string } | null>;
  /** Owners Minawa's WhatsApp number messaged since `sinceIso` (all projects): WhatsApp's daily limit counts unique people. */
  recentRecipients(sinceIso: string): Promise<string[]>;
  /** Raw import of a whole sample or migration (replaces a project's data). */
  replaceProjectData(pid: string, s: State): Promise<void>;
  saveTemplates(t: Record<string, Template>): Promise<void>;
  saveSettings(s: ProjectSettings): Promise<void>;
  /** True at most once per `seconds` for this name, across all servers (e.g. how often Safepay is checked). */
  throttle(name: string, seconds: number): Promise<boolean>;
  /** Payments on or after a date (id, day and time only): for the "new payments" badges. */
  paymentsSince(project: string, since: string): Promise<{ id: string; d: string; t: string }[]>;
  getCompany(): Promise<Company>;
  saveCompany(c: Company): Promise<void>;
}
export const DEFAULT_COMPANY: Company = { legalName: 'Minawa (Pvt) Ltd', address: '', ntn: '', phone: '', email: '' };

/** Fills fields added after the first version, so older saved data still loads. */
export function normalizeState(s: State) {
  for (const o of s.owners) { if (!o.plan) o.plan = 'monthly'; if (o.floor == null) o.floor = ''; if (o.sheet === undefined) o.sheet = null; if (o.generator == null) o.generator = false; }
  for (const b of s.bills as (State['bills'][number] & { reminded?: boolean })[]) {
    if (!Array.isArray(b.reminders)) b.reminders = [];
    if (!Array.isArray(b.lines)) b.lines = [{ kind: 'maintenance', label: `Maintenance, ${b.period}`, amount: b.amount }];
    if (b.months == null) b.months = 1;
    if (!b.periodEnd) b.periodEnd = b.period;
    if (b.extras == null) b.extras = 0;
    delete b.reminded;
  }
  s.charges = s.charges || []; s.notices = s.notices || []; s.approvals = s.approvals || [];
  return s;
}

// Snapshots taken at load time, so a save writes only rows that were added or changed.
const SNAP = new WeakMap<State, Record<string, Map<string, string>>>();
export function snapshot(s: State) {
  const snap: Record<string, Map<string, string>> = {};
  for (const t of STATE_TABLES) {
    const m = new Map<string, string>();
    for (const r of rowsOf(s, t)) m.set(String((r as Record<string, unknown>)[KEY[t]]), JSON.stringify(r));
    snap[t] = m;
  }
  snap.__tpl = new Map([['t', JSON.stringify(s.templates)]]);
  snap.__set = new Map([['s', JSON.stringify(s.settings)]]);
  snap.__seq = new Map(Object.entries(s.seq).map(([k, v]) => [k, String(v)]));
  SNAP.set(s, snap);
}
export function rowsOf(s: State, t: TableName): object[] { return (s as unknown as Record<string, object[]>)[t]; }
export function changes(s: State) {
  const snap = SNAP.get(s);
  const out: Partial<Record<TableName, object[]>> = {};
  for (const t of STATE_TABLES) {
    const before = snap?.[t];
    const ch = rowsOf(s, t).filter(r => { const k = String((r as Record<string, unknown>)[KEY[t]]); return !before || before.get(k) !== JSON.stringify(r); });
    if (ch.length) out[t] = ch;
  }
  const tpl = !snap || snap.__tpl.get('t') !== JSON.stringify(s.templates);
  const set = !snap || snap.__set.get('s') !== JSON.stringify(s.settings);
  const seq = Object.entries(s.seq).filter(([k, v]) => !snap || snap.__seq.get(k) !== String(v));
  return { rows: out, tpl, set, seq };
}

let store: Store | null = null;
export async function getStore(): Promise<Store> {
  if (store) return store;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseStore } = await import('./supabase');
    store = new SupabaseStore();
  } else {
    const { LocalStore } = await import('./local');
    store = new LocalStore();
  }
  return store;
}
