// Customers with no possession date as an Excel workbook (Possession dates page), for the buildings the person looks
// after.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, apartments, aptOrder, balance } from '@/lib/engine';
import { todayPKT, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const pid = new URL(req.url).searchParams.get('project');
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const x = new Sheet('No possession date').title('Customers with no possession date').note(`Fill in the last column · downloaded by ${staff.name} on ${fd(todayPKT())}`).blank()
    .head(['Building', 'Apartment', 'Block', 'Type', 'Customer', 'WhatsApp', ['Owes (Rs)', 'money'], 'Possession date (fill in)']);
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => apartments().filter(o => o.status === 'active' && !o.possessionKnown).sort(aptOrder)
      .forEach(o => x.row([s.proj.name, o.apt, o.block, o.type, o.name, o.noPhone ? '' : o.phone, Math.max(0, balance(o)), ''])));
  }
  return xlsxResponse(x, `minawa-no-possession-date-${pid || 'all'}-${todayPKT()}`);
}
