// The month's utility sheet as an Excel workbook (apartment, owner, units, amount), to fill in Excel and import back
// (the import reads .xlsx and .csv). The column names stay on the first row so it imports as it is.
import { currentStaff } from '@/lib/session';
import { load } from '@/lib/ops';
import { use, apartments, aptOrder } from '@/lib/engine';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || '', period = u.searchParams.get('period') || '', kind = u.searchParams.get('kind') || 'Electricity';
  const s = await load(pid, staff);
  const x = new Sheet(`${kind} ${period}`).head(['Apartment', 'Block', 'Owner', ['Units', 'int'], ['Amount', 'money']]);
  use(s, () => apartments().filter(o => o.status === 'active').sort(aptOrder).forEach(o => {
    const c = s.charges.find(y => y.ownerId === o.id && y.period === period && y.kind === kind);
    x.row([o.apt, o.block, o.name, c?.units ?? '', c?.amount ?? '']);
  }));
  return xlsxResponse(x, `${kind.toLowerCase()}-${pid}-${period}`);
}
