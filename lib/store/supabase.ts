// Supabase store (production). Uses the service role on the server only; the browser never writes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { State, Project, LogEntry, Staff, Template, ProjectSettings, Company, WaLog } from '../types';
import { TEMPLATES, defaultSettings } from '../defaults';
import { TABLES, STATE_TABLES, KEY, toCol, fromCol, natSort, type TableName } from './tables';
import { snapshot, changes, rowsOf, normalizeState, DEFAULT_COMPANY, type Store, type LoadOpts, type LogQuery, type WaLogQuery } from './index';

const toRow = (o: Record<string, unknown>, cols?: readonly string[]) => {
  const r: Record<string, unknown> = {};
  for (const k of cols || Object.keys(o)) r[toCol(k)] = o[k] === undefined ? null : o[k];
  return r;
};
const fromRow = <T>(r: Record<string, unknown>): T => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[fromCol(k)] = v;
  return o as T;
};

export class SupabaseStore implements Store {
  kind = 'supabase' as const;
  db: SupabaseClient;
  constructor() {
    this.db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  private async all(table: string, filter?: [string, string]) {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      let q = this.db.from(table).select('*').range(from, from + 999);
      if (filter) q = q.eq(filter[0], filter[1]);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  private async upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  async listProjects() {
    const rows = await this.all('projects');
    return rows.sort((a, b) => (a.sort as number) - (b.sort as number)).map(r => { const p = fromRow<Project & { sort?: number }>(r); delete p.sort; return p; });
  }
  async saveProject(p: Project) {
    const { error } = await this.db.from('projects').upsert(toRow(p as unknown as Record<string, unknown>), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  async loadState(pid: string, o: LoadOpts): Promise<State> {
    const [projRows, tplRows, setRows, ctrRows, ...tables] = await Promise.all([
      this.db.from('projects').select('*').eq('id', pid).then(r => r.data || []),
      this.all('templates'), this.db.from('project_settings').select('*').eq('project', pid).then(r => r.data || []), this.all('counters'),
      // approvals arrived with migration 0007: until it has run, there are none (instead of every page failing).
      ...STATE_TABLES.map(t => t === 'approvals' ? this.all(t, ['project', pid]).catch(() => []) : this.all(t, ['project', pid]))
    ]);
    if (!projRows.length) throw new Error(`Unknown project ${pid}`);
    const proj = fromRow<Project & { sort?: number }>(projRows[0]); delete proj.sort;
    const templates: Record<string, Template> = JSON.parse(JSON.stringify(TEMPLATES));
    for (const r of tplRows) { const t = fromRow<Template>(r); templates[t.key] = t; }
    const set = defaultSettings(pid, setRows[0] ? fromRow<ProjectSettings>(setRows[0]) : null);
    const s = {
      project: pid, proj, today: o.today, goLive: proj.goLive || o.today, by: o.by || 'System', role: o.role || 'admin', templates, settings: set,
      log: [], seq: Object.fromEntries(ctrRows.map(r => [r.k as string, Number(r.n)]))
    } as unknown as State;
    STATE_TABLES.forEach((t, i) => { (s as unknown as Record<string, unknown>)[t] = natSort((tables[i] as Record<string, unknown>[]).map(r => fromRow(r))); });
    s.company = await this.getCompany();
    normalizeState(s);
    snapshot(s);
    return s;
  }
  async saveState(s: State) {
    const ch = changes(s);
    // Parents before children (owners before bills, entries, …) for the foreign keys.
    for (const t of STATE_TABLES) {
      const rows = ch.rows[t]; if (!rows) continue;
      await this.upsert(t, rows.map(r => toRow(r as Record<string, unknown>, TABLES[t])), toCol(KEY[t]));
    }
    if (ch.tpl) await this.saveTemplates(s.templates);
    if (ch.set) await this.saveSettings(s.settings);
    if (ch.seq.length) await this.upsert('counters', ch.seq.map(([k, n]) => ({ k, n })), 'k');
    if (s.log.length) { await this.appendLog(s.log); s.log = []; }
    snapshot(s);
  }
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const holder = randomUUID();
    for (let i = 0; ; i++) {
      const { data, error } = await this.db.rpc('acquire_lock', { p_name: 'engine', p_holder: holder, p_ttl: 120 });
      if (error) throw new Error(error.message);
      if (data) break;
      if (i > 60) throw new Error('The system is busy. Try again in a minute.');
      await new Promise(r => setTimeout(r, 500));
    }
    try { return await fn(); } finally { await this.db.rpc('release_lock', { p_name: 'engine', p_holder: holder }); }
  }
  async getLog(o: LogQuery) {
    let q = this.db.from('activity_log').select('*').order('n', { ascending: false }).limit(o.limit || 250);
    if (o.project) q = q.eq('project', o.project);
    if (o.kinds) q = q.in('kind', o.kinds);
    if (o.staffIds) q = o.staffIds.length ? q.in('staff_id', o.staffIds) : q.eq('id', '__none__');
    else if (o.staffOnly) q = q.not('staff_id', 'is', null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(r => { const e = fromRow<LogEntry & { createdAt?: string; n?: number }>(r); delete e.createdAt; delete e.n; return e; });
  }
  async appendLog(entries: LogEntry[]) { if (entries.length) await this.upsert('activity_log', entries.map(e => toRow(e as unknown as Record<string, unknown>)), 'id'); }
  async addWaLog(e: WaLog) { await this.upsert('whatsapp_log', [toRow(e as unknown as Record<string, unknown>)], 'id'); }
  async getWaLog(o: WaLogQuery) {
    let q = this.db.from('whatsapp_log').select('*').order('n', { ascending: false }).limit(o.limit || 300);
    if (o.project) q = q.eq('project', o.project);
    if (o.ownerId) q = q.eq('owner_id', o.ownerId);
    if (o.answer) q = q.eq('answer', o.answer);
    if (o.since) q = q.gte('d', o.since);
    if (o.staffIds) q = o.staffIds.length ? q.in('staff_id', o.staffIds) : q.eq('id', '__none__');
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(r => { const e = fromRow<WaLog & { n?: number }>(r); delete e.n; return e as WaLog; });
  }
  async listStaff() { return (await this.all('staff')).map(r => { const s = fromRow<Staff & { createdAt?: string }>(r); delete s.createdAt; return s; }); }
  async saveStaff(st: Staff) { await this.upsert('staff', [toRow(st as unknown as Record<string, unknown>)], 'id'); }
  async recentRecipients(sinceIso: string) {
    const out = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from('messages').select('owner_id').eq('from_', 'biz').in('status', ['sent', 'delivered', 'read']).gte('sent_at', sinceIso).range(from, from + 999);
      if (error) throw new Error(error.message);
      (data || []).forEach(r => out.add(String(r.owner_id)));
      if (!data || data.length < 1000) break;
    }
    return [...out];
  }
  async locate(q: { phoneDigits?: string; linkId?: string; spLinkId?: string; waId?: string; reference?: string }) {
    if (q.phoneDigits) {
      const tail = q.phoneDigits.slice(-10);
      const { data } = await this.db.from('owners').select('id,project,phone').eq('status', 'active').ilike('phone', `%${tail.slice(-4)}%`);
      const o = (data || []).find(x => String(x.phone).replace(/\D/g, '').endsWith(tail));
      if (o) return { project: o.project as string, id: o.id as string };
    }
    if (q.linkId || q.reference) { const { data } = await this.db.from('links').select('id,project').eq('id', q.linkId || q.reference!).limit(1); if (data?.[0]) return { project: data[0].project, id: data[0].id }; }
    if (q.spLinkId) { const { data } = await this.db.from('links').select('id,project').eq('sp->>id', q.spLinkId).limit(1); if (data?.[0]) return { project: data[0].project, id: data[0].id }; }
    if (q.waId) { const { data } = await this.db.from('messages').select('id,project').eq('wa_id', q.waId).limit(1); if (data?.[0]) return { project: data[0].project, id: data[0].id }; }
    return null;
  }
  async replaceProjectData(pid: string, s: State) {
    for (const t of [...STATE_TABLES].reverse()) { if (t === 'owners' || t === 'rates') continue; const { error } = await this.db.from(t).delete().eq('project', pid); if (error) throw new Error(`${t}: ${error.message}`); }
    { const { error } = await this.db.from('owners').delete().eq('project', pid); if (error) throw new Error(error.message); }
    { const { error } = await this.db.from('rates').delete().eq('project', pid); if (error) throw new Error(error.message); }
    for (const t of STATE_TABLES) {
      const rows = rowsOf(s, t) as Record<string, unknown>[];
      if (rows.length) await this.upsert(t, rows.map(r => toRow(r, TABLES[t])), toCol(KEY[t]));
    }
    await this.saveSettings(s.settings);
    await this.saveTemplates(s.templates);
    if (Object.keys(s.seq).length) {
      const cur = await this.all('counters'), m = new Map(cur.map(r => [r.k as string, Number(r.n)]));
      await this.upsert('counters', Object.entries(s.seq).map(([k, n]) => ({ k, n: Math.max(n, m.get(k) || 0) })), 'k');
    }
    if (s.log.length) { await this.appendLog(s.log); s.log = []; }
  }
  async saveTemplates(t: Record<string, Template>) { await this.upsert('templates', Object.values(t).map(x => toRow(x as unknown as Record<string, unknown>)), 'key'); }
  async saveSettings(st: ProjectSettings) { await this.upsert('project_settings', [toRow(st as unknown as Record<string, unknown>)], 'project'); }
  async throttle(name: string, seconds: number) {
    const { data, error } = await this.db.rpc('acquire_lock', { p_name: name, p_holder: randomUUID(), p_ttl: seconds });
    if (error) throw new Error(error.message);
    return !!data;   // not released: the lock expiring is the throttle
  }
  async paymentsSince(project: string, since: string) {
    const { data, error } = await this.db.from('payments').select('id,d,t').eq('project', project).gte('d', since).limit(1000);
    if (error) throw new Error(error.message);
    return (data || []).map(r => ({ id: String(r.id), d: String(r.d), t: String(r.t) }));
  }
  async getCompany() { const { data } = await this.db.from('company').select('*').eq('id', 1).limit(1); const r = data?.[0]; if (!r) return { ...DEFAULT_COMPANY }; const c = fromRow<Company & { id?: number }>(r); delete c.id; return { ...DEFAULT_COMPANY, ...c }; }
  async saveCompany(c: Company) { await this.upsert('company', [{ id: 1, ...toRow(c as unknown as Record<string, unknown>) }], 'id'); }
}
// Keep TableName referenced for editors.
export type { TableName };
