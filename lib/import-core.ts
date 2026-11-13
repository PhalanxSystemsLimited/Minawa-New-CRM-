// The owner import itself (first setup or later additions), shared by the Set up screen and scripts.
import type { Owner, Rate, Staff, Project } from './types';
import type { Store } from './store';
import { staffName } from './session';
import { load } from './ops';
import { use, nid, log, runDaily, setTarget, quietly, at, billDateOf, rateFor } from './engine';
import { addDays, fd, rs, todayPKT, prevMonth } from './fmt';
import { blankOwner } from './seed';
import type { ImportRow } from './importer';

export interface ImportOpts { goLive: string; bank?: string; source?: string; rates: Record<string, number>; today?: string }

export async function importOwners(store: Store, proj: Project, staff: Staff, rows: ImportRow[], opts: ImportOpts) {
  const pid = proj.id, first = !proj.live, today = opts.today || todayPKT();
  const goLive = (opts.goLive || today).slice(0, 7) + '-01', bank = (opts.bank || '').trim(), source = opts.source || 'owner list', rates = opts.rates;
  return store.withLock(async () => {
    if (first) { proj.live = true; proj.goLive = goLive; if (bank) proj.bank = bank; await store.saveProject(proj); }
    const s = await load(pid, staff);
    let added = 0, updated = 0;
    use(s, () => {
      if (first) {
        const from = `${goLive.slice(0, 4)}-01-01`;
        for (const [type, amount] of Object.entries(rates)) if (!s.rates.some(r => r.type === type && r.from === from)) s.rates.push({ id: `${pid}:${type}:${from}`, project: pid, type, from, amount } as Rate);
        s.goLive = goLive;
      }
      // A flat whose yearly charge on the sheet isn't 12 × the rate card is charged its own monthly rate.
      const ownRate = (r: ImportRow) => { if (r.rate) return r.rate; if (!r.yearly) return null; const card = rateFor(r.type, `${goLive.slice(0, 7)}-25`) || rates[r.type] || 0, m = Math.round(r.yearly / 12); return m && m !== card ? m : null; };
      const byApt = new Map(s.owners.filter(o => o.status === 'active').map(o => [o.apt.toUpperCase(), o]));
      for (const r of rows) {
        const ex = byApt.get(r.apt.toUpperCase());
        if (ex) {
          const ch: string[] = [];
          if (r.name && r.name !== ex.name) { ch.push(`name → ${r.name}`); ex.name = r.name; }
          if (r.phone && r.phone !== ex.phone) { ch.push(`WhatsApp → ${r.phone}`); ex.phone = r.phone; ex.invalidPhone = false; ex.noPhone = false; }
          if (r.email && r.email !== ex.email) ex.email = r.email;
          if (r.possession && (!ex.possessionKnown || r.possession !== ex.possession)) { ch.push(`possession → ${fd(r.possession)}`); ex.possession = r.possession; ex.possessionKnown = true; }
          if (ch.length) { updated++; log(s.today, at(15), 'admin', `${ex.apt} updated from ${source}: ${ch.join('; ')}`, ex.id); }
          continue;
        }
        const o: Owner = blankOwner({ id: 'O' + nid('o'), project: pid, apt: r.apt, block: r.block, type: r.type, name: r.name, phone: r.phone, email: r.email,
          possession: r.possession || '2000-01-01', possessionKnown: !!r.possession,   // unknown: billed from go-live
          opening: Math.max(0, r.opening), openingLeft: Math.max(0, r.opening), credit: Math.max(0, -r.opening),
          exempt: r.exempt, director: r.director, exemptWhy: r.exempt && !r.director ? r.exemptWhy || 'Marked as on hold in the import, so this flat isn\'t billed until someone confirms it should be.' : null,
          discount: r.discount ? { kind: 'fixed', value: r.discount, until: null } : null, rate: ownRate(r), invalidPhone: !r.phone, noPhone: !r.phone, plan: r.plan || 'monthly', floor: r.floor || '',
          notes: [{ d: s.today, by: 'Import', text: `Imported from ${source}${r.notes.length ? ': ' + r.notes.join('; ') : ''}. Opening balance ${r.opening < 0 ? rs(-r.opening) + ' credit' : rs(r.opening)}.${r.possession ? '' : ' No possession date, so billed on the 1st for now.'}` }] });
        s.owners.push(o); added++;
        if (r.opening) s.entries.push({ id: 'E' + nid('e'), ownerId: o.id, project: pid, d: first ? addDays(goLive, -1) : s.today, kind: 'opening', amount: r.opening, desc: r.opening > 0 ? 'Opening balance · unpaid before the new system' : 'Opening credit · paid ahead', ref: null, pid: null });
      }
      log(s.today, at(15), 'job', `${first ? 'Go-live set up' : 'Owners imported'} by ${staffName(staff)} from ${source}: ${added} added, ${updated} updated`);
      // A go-live date in the past: make the bills and fees for those days, without sending anything for them.
      if (first) {
        const last = addDays(today, -1);
        // Billing is in advance: the first bill (for the go-live month) goes out on the bill day of the month before.
        const firstRun = billDateOf(prevMonth(goLive.slice(0, 7)));
        quietly(() => { for (let d = firstRun; d <= last; d = addDays(d, 1)) { s.today = d; runDaily(d); } });
        s.today = today; setTarget(today.slice(0, 7));
        s.settings.lastRun = last;   // from today the daily run carries on (the first bill goes out on firstRun)
      }
    });
    await store.saveState(s);
    return { added, updated };
  });
}
