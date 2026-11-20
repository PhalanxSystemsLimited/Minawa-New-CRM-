// Payments as an Excel workbook (one building's Payments tab, or all buildings).
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { payFiltered } from '@/lib/queries';
import { todayPKT, t12, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), per = u.searchParams.get('per') || 'all', fam = u.searchParams.get('fam') || 'all', q = u.searchParams.get('q') || '';
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const x = new Sheet('Payments').title('Payments').note(`Downloaded by ${staff.name} on ${fd(todayPKT())}`).blank()
    .head(['Building', ['Date', 'date'], 'Time', 'Apartment', 'Owner', ['Amount (Rs)', 'money'], 'Method', 'Recorded by', 'Receipt', 'Reference']);
  let t = 0, n = 0;
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => payFiltered(per, fam, q).forEach(p => { const o = ownerById(p.ownerId);
      x.row([s.proj.name, p.d, t12(p.t), o.apt, o.name, p.amount, p.method, p.by, p.receipt, p.ref]); t += p.amount; n++; }));
  }
  x.total(['Total', '', '', '', `${n} payment${n === 1 ? '' : 's'}`, t]);
  return xlsxResponse(x, `minawa-payments-${pid || 'all'}-${todayPKT()}`);
}
