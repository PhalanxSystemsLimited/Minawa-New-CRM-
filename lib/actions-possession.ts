'use server';
// Missing possession dates (18 Nov 2026): customers on the office lists with no possession date are due on the 1st
// until one is added. The list (/possession) lets staff add them in bulk for the buildings they look after: the
// Admin's dates apply at once; an Accountant's or a Building manager's go to the Admin for approval.
import { redirect } from 'next/navigation';
import { requireStaff } from './session';
import { mutate, liveProjects } from './ops';
import { ownerById } from './engine';
import { changeOrRequest } from './approvals';
import { todayPKT } from './fmt';

const go = (path: string, toast: string): never => redirect(path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(toast));

export async function possessionDatesAction(fdata: FormData) {
  const staff = await requireStaff(), back = String(fdata.get('back') || '/possession'), reason = String(fdata.get('why') || '').trim();
  const today = todayPKT(), by = new Map<string, [string, string][]>();
  for (const [k, v] of fdata.entries()) {
    const m = /^pd:([a-z0-9]+):([A-Za-z0-9_-]+)$/.exec(k), d = String(v).trim();
    if (!m || !d) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < '1990-01-01') go(back, `Check the date for one of the apartments: ${d} isn't a real possession date`);
    by.set(m[1], [...(by.get(m[1]) || []), [m[2], d]]);
  }
  if (!by.size) go(back, 'Enter at least one possession date');
  if (staff.role !== 'admin' && !reason) go(back, 'Write where the dates come from (for the Admin)');
  const allowed = new Set((await liveProjects(staff)).map(p => p.id));
  let applied = 0, requested = 0;
  for (const [pid, list] of by) {
    if (!allowed.has(pid)) continue;
    const r = await mutate(pid, staff, () => {
      let a = 0, q = 0;
      for (const [oid, d] of list) {
        const o = ownerById(oid); if (!o || o.possessionKnown) continue;
        const x = changeOrRequest(o, 'posdate', { possession: d }, reason || 'From the office records');
        if (x.done === 'applied') a++; else if (x.done === 'requested') q++;
      }
      return { a, q };
    }, { send: false });
    applied += r.a; requested += r.q;
  }
  go(back, applied ? `${applied} possession date${applied === 1 ? '' : 's'} saved. Their due day changes from the next bill.`
    : requested ? `${requested} possession date${requested === 1 ? '' : 's'} sent to the Admin for approval.` : 'Nothing changed');
}
