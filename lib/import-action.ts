'use server';
// Imports owners into a project: the first setup (rate card, go-live, owners, opening balances) or later
// additions and corrections (matched by apartment number).
import { redirect } from 'next/navigation';
import { requireAdmin } from './session';
import { getStore } from './store';
import { importOwners } from './import-core';
import { todayPKT } from './fmt';
import type { ImportRow } from './importer';

export async function importAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = String(fdata.get('pid')), back = `/p/${pid}/setup`;
  let rows: ImportRow[] = [];
  try { rows = JSON.parse(String(fdata.get('rows') || '[]')); } catch { redirect(back + '?t=' + encodeURIComponent('Couldn\'t read the file. Pick it again.')); }
  if (!rows.length) redirect(back + '?t=' + encodeURIComponent('No apartments to import.'));
  const store = await getStore(), proj = (await store.listProjects()).find(p => p.id === pid);
  if (!proj) redirect('/');
  const first = !proj!.live, today = todayPKT();
  // Go-live = the first month the system bills (opening balances cover everything before it). Always the 1st.
  const goLive = (String(fdata.get('goLive') || '') || today).slice(0, 7) + '-01', bank = String(fdata.get('bank') || '').trim(), source = String(fdata.get('source') || 'owner list');
  const rates: Record<string, number> = {};
  for (const [k, v] of fdata.entries()) if (k.startsWith('rate:') && +v > 0) rates[k.slice(5)] = Math.round(+v);
  if (first && rows.some(r => !rates[r.type] && !r.rate)) redirect(back + '?t=' + encodeURIComponent('Enter a monthly rate for every apartment type.'));

  const out = await importOwners(store, proj!, staff, rows, { goLive, bank, source, rates });
  redirect(`/p/${pid}/apartments?t=` + encodeURIComponent(`${out.added} apartments added, ${out.updated} updated`));
}
