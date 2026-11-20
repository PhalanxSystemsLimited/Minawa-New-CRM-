// Entries to approve as an Excel workbook (Accountant's To do): payments building managers entered and nobody has
// approved yet.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { todayPKT, t12, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const pid = new URL(req.url).searchParams.get('project');
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const x = new Sheet('Entries to approve').title(`Payment entries to approve · ${fd(todayPKT())}`).note(`Entered by building managers, not confirmed by the Accountant yet · downloaded by ${staff.name}`).blank()
    .head(['Building', ['Entered on', 'date'], 'Time', 'Apartment', 'Customer', ['Amount (Rs)', 'money'], 'Received as', ['Paid on', 'date'], 'Receipt no.', 'Bank transaction ID', 'Entered by', 'Note']);
  let total = 0, n = 0;
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => s.proofs.filter(p => p.kind === 'cash' && p.status === 'pending' && (staff.role !== 'manager' || p.byId === staff.id)).forEach(p => {
      const o = ownerById(p.ownerId); total += p.amount; n++;
      x.row([s.proj.name, p.d, t12(p.t), o?.apt, o?.name, p.amount, p.method || 'Cash', p.paidOn, p.ref, p.txn, p.byName, p.note]);
    }));
  }
  x.total(['Total', '', '', '', `${n} entr${n === 1 ? 'y' : 'ies'}`, total]);
  return xlsxResponse(x, `minawa-entries-to-approve-${pid || 'all'}-${todayPKT()}`);
}
