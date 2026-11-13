// File store for running without Supabase: data/local-db.json, created from the sample on first use.
import fs from 'node:fs';
import path from 'node:path';
import type { State, Project, LogEntry, Staff, Template, ProjectSettings, Rate, Company, WaLog } from '../types';
import { TEMPLATES, PROJECTS, defaultSettings } from '../defaults';
import { STATE_TABLES, KEY, natSort, type TableName } from './tables';
import { snapshot, changes, rowsOf, normalizeState, DEFAULT_COMPANY, type Store, type LoadOpts, type LogQuery, type WaLogQuery } from './index';
import { buildSample, SAMPLE_START } from '../seed';

interface DB {
  projects: Project[]; templates: Record<string, Template>; settings: Record<string, ProjectSettings>; counters: Record<string, number>;
  log: LogEntry[]; staff: Staff[]; company?: Company; walog?: WaLog[];
  owners: object[]; bills: object[]; entries: object[]; links: object[]; messages: object[]; payments: object[]; proofs: object[]; alerts: object[]; clearances: object[]; charges: object[]; notices: object[]; approvals?: object[]; rates: Rate[];
}
const FILE = path.join(process.cwd(), 'data', 'local-db.json');
const g = globalThis as unknown as { __minawaDb?: DB; __minawaLock?: Promise<unknown> };

function empty(): DB {
  return { projects: PROJECTS.map(p => ({ ...p })), templates: JSON.parse(JSON.stringify(TEMPLATES)), settings: {}, counters: {}, log: [],
    staff: [{ id: 'local-admin', email: 'admin@minawa.local', name: 'Admin', role: 'admin', active: true }, { id: 'local-accountant', email: 'accountant@minawa.local', name: 'Accountant', role: 'accountant', active: true }],
    owners: [], bills: [], entries: [], links: [], messages: [], payments: [], proofs: [], alerts: [], clearances: [], charges: [], notices: [], approvals: [], rates: [] };
}
function db(): DB {
  if (g.__minawaDb) return g.__minawaDb;
  if (fs.existsSync(FILE)) g.__minawaDb = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DB;
  else { g.__minawaDb = process.env.LOCAL_SAMPLE === 'off' ? empty() : sampleDb(); flush(); }
  g.__minawaDb.approvals = g.__minawaDb.approvals || [];
  return g.__minawaDb;
}
/** The demo's sample (three projects, two months of history) as a fresh local database. */
export function sampleDb(): DB {
  const d = empty(), { projects, states, seq } = buildSample();
  d.projects = projects;
  for (const st of states) {
    for (const t of STATE_TABLES) tbl(d, t).push(...(clone(rowsOf(st, t)) as Record<string, unknown>[]));
    d.settings[st.project] = { ...clone(st.settings), lastRun: SAMPLE_START };
    d.log.push(...clone(st.log));
    d.templates = clone(st.templates);
  }
  d.counters = clone(seq);
  return d;
}
function flush() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(g.__minawaDb));
  fs.renameSync(tmp, FILE);
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const tbl = (d: DB, t: TableName) => (d as unknown as Record<string, Record<string, unknown>[]>)[t];

export class LocalStore implements Store {
  kind = 'local' as const;
  async listProjects() { return clone(db().projects); }
  async saveProject(p: Project) { const d = db(); const i = d.projects.findIndex(x => x.id === p.id); if (i >= 0) d.projects[i] = clone(p); else d.projects.push(clone(p)); flush(); }
  async loadState(pid: string, o: LoadOpts): Promise<State> {
    const d = db(), proj = d.projects.find(p => p.id === pid);
    if (!proj) throw new Error(`Unknown project ${pid}`);
    const pick = (t: TableName) => natSort(clone((tbl(d, t) || []).filter(r => r.project === pid)));
    const s: State = {
      project: pid, proj: clone(proj), today: o.today, goLive: proj.goLive || o.today, by: o.by || 'System', role: o.role || 'admin',
      rates: pick('rates') as unknown as Rate[], templates: clone(d.templates),
      settings: defaultSettings(pid, clone(d.settings[pid] || null)),
      owners: pick('owners'), bills: pick('bills'), entries: pick('entries'), links: pick('links'), messages: pick('messages'), payments: pick('payments'),
      proofs: pick('proofs'), alerts: pick('alerts'), clearances: pick('clearances'), charges: pick('charges'), notices: pick('notices'), approvals: pick('approvals'), log: [], seq: clone(d.counters)
    } as unknown as State;
    s.company = { ...DEFAULT_COMPANY, ...(d.company || {}) };
    normalizeState(s);
    snapshot(s);
    return s;
  }
  async saveState(s: State) {
    const d = db(), ch = changes(s);
    for (const t of STATE_TABLES) {
      const rows = ch.rows[t]; if (!rows) continue;
      const list = tbl(d, t), idx = new Map(list.map((r, i) => [String(r[KEY[t]]), i]));
      for (const r of rows) { const k = String((r as Record<string, unknown>)[KEY[t]]), i = idx.get(k); if (i != null) list[i] = clone(r) as Record<string, unknown>; else { list.push(clone(r) as Record<string, unknown>); idx.set(k, list.length - 1); } }
    }
    if (ch.tpl) d.templates = clone(s.templates);
    if (ch.set) d.settings[s.project] = clone(s.settings);
    for (const [k, v] of Object.entries(s.seq)) d.counters[k] = Math.max(d.counters[k] || 0, v);
    if (s.log.length) { d.log.push(...clone(s.log)); if (d.log.length > 20000) d.log.splice(0, d.log.length - 20000); s.log = []; }
    flush();
    snapshot(s);
  }
  async throttle(name: string, seconds: number) {
    const t = (g as unknown as { __minawaThrottle?: Record<string, number> }), now = Date.now();
    t.__minawaThrottle = t.__minawaThrottle || {};
    if ((t.__minawaThrottle[name] || 0) > now) return false;
    t.__minawaThrottle[name] = now + seconds * 1000; return true;
  }
  async paymentsSince(project: string, since: string) {
    return (db().payments as { id: string; project: string; d: string; t: string }[]).filter(p => p.project === project && p.d >= since).map(p => ({ id: p.id, d: p.d, t: p.t }));
  }
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = g.__minawaLock || Promise.resolve();
    let done!: () => void;
    const mine = new Promise<void>(r => { done = r; });
    g.__minawaLock = prev.then(() => mine);
    await prev.catch(() => undefined);
    try { g.__minawaDb = undefined; return await fn(); } finally { done(); }
  }
  async getLog(o: LogQuery) {
    const d = db();
    return clone(d.log.filter(e => (!o.project || e.project === o.project) && (!o.kinds || o.kinds.includes(e.kind)) && (o.staffIds ? !!e.staffId && o.staffIds.includes(e.staffId) : !o.staffOnly || !!e.staffId)).slice(-(o.limit || 250)).reverse());
  }
  async appendLog(entries: LogEntry[]) { db().log.push(...clone(entries)); flush(); }
  async addWaLog(e: WaLog) { const d = db(); (d.walog ||= []).push(clone(e)); flush(); }
  async getWaLog(o: WaLogQuery) {
    return clone((db().walog || []).filter(e => (!o.project || e.project === o.project) && (!o.ownerId || e.ownerId === o.ownerId) && (!o.answer || e.answer === o.answer)
      && (!o.since || e.d >= o.since) && (!o.staffIds || (!!e.staffId && o.staffIds.includes(e.staffId)))).slice(-(o.limit || 300)).reverse());
  }
  async listStaff() { return clone(db().staff); }
  async saveStaff(st: Staff) { const d = db(); const i = d.staff.findIndex(x => x.id === st.id); if (i >= 0) d.staff[i] = clone(st); else d.staff.push(clone(st)); flush(); }
  async locate(q: { phoneDigits?: string; linkId?: string; spLinkId?: string; waId?: string; reference?: string }) {
    const d = db();
    if (q.phoneDigits) {
      const tail = q.phoneDigits.slice(-10);
      const o = (d.owners as { id: string; project: string; phone: string; status: string }[]).filter(x => x.status === 'active').find(x => x.phone.replace(/\D/g, '').endsWith(tail));
      if (o) return { project: o.project, id: o.id };
    }
    const links = d.links as { id: string; project: string; sp: { id: string } | null }[];
    if (q.linkId || q.reference) { const l = links.find(x => x.id === (q.linkId || q.reference)); if (l) return { project: l.project, id: l.id }; }
    if (q.spLinkId) { const l = links.find(x => x.sp && x.sp.id === q.spLinkId); if (l) return { project: l.project, id: l.id }; }
    if (q.waId) { const m = (d.messages as { id: string; project: string; waId: string | null }[]).find(x => x.waId === q.waId); if (m) return { project: m.project, id: m.id }; }
    return null;
  }
  async replaceProjectData(pid: string, s: State) {
    const d = db();
    for (const t of STATE_TABLES) { const list = tbl(d, t); const keep = list.filter(r => r.project !== pid); keep.push(...(clone(rowsOf(s, t)) as Record<string, unknown>[])); (d as unknown as Record<string, unknown>)[t] = keep; }
    d.settings[pid] = clone(s.settings);
    d.templates = clone(s.templates);
    for (const [k, v] of Object.entries(s.seq)) d.counters[k] = Math.max(d.counters[k] || 0, v);
    d.log.push(...clone(s.log)); s.log = [];
    flush();
  }
  async saveTemplates(t: Record<string, Template>) { db().templates = clone(t); flush(); }
  async saveSettings(st: ProjectSettings) { db().settings[st.project] = clone(st); flush(); }
  async getCompany() { return { ...DEFAULT_COMPANY, ...(db().company || {}) }; }
  async saveCompany(c: Company) { db().company = clone(c); flush(); }
}
export function resetLocal(data?: Partial<DB>) { g.__minawaDb = { ...empty(), ...(data || {}) }; flush(); }
