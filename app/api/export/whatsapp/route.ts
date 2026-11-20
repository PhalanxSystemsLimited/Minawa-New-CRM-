// The WhatsApp log as an Excel workbook, with the same filters as the page. Admins get everyone; an accountant gets
// their own.
import { currentStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { todayPKT, addDays, t12, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), g = (k: string) => u.searchParams.get(k) || '';
  const store = await getStore(), staff = await store.listStaff(), projs = await listProjects(me), today = todayPKT();
  const per = g('per') || 'all', since = per === 'all' ? null : per === 'today' ? today : addDays(today, -(+per - 1 || 29));
  const who = me.role === 'admin' ? g('who') || 'all' : me.id;
  const ids = who === 'all' ? null : who === 'accountants' ? staff.filter(s => s.role === 'accountant').map(s => s.id) : [who];
  const a = g('a') === 'sent' || g('a') === 'not_sent' ? g('a') as 'sent' | 'not_sent' : null, q = g('q').toLowerCase();
  let list = await store.getWaLog({ project: g('p') || null, staffIds: ids, answer: a, since, limit: 20000 });
  if (q) list = list.filter(e => `${e.apt} ${e.ownerName} ${e.phone} ${e.sentTo} ${e.fromNumber || ''} ${e.title} ${e.staffName}`.toLowerCase().includes(q));
  const pname = (id: string) => projs.find(p => p.id === id)?.name || id;
  const x = new Sheet('WhatsApp log').title('WhatsApp log').note(`${list.length} message${list.length === 1 ? '' : 's'} · downloaded by ${me.name} on ${fd(today)}`).blank()
    .head([['Date', 'date'], 'Time', 'Answer', 'Sent by', 'Role', 'Sent from number', 'Building', 'Apartment', 'Owner', 'Owner number', 'Chat opened with', 'Test', 'Message', 'Text', ['Balance then (Rs)', 'money'], 'Confirmed', 'Message id', ['Recorded at', 'datetime']]);
  for (const e of list) x.row([e.d, t12(e.t), e.answer === 'sent' ? 'Sent' : 'Opened, not sent', e.staffName, e.staffRole, e.fromNumber ? '+' + e.fromNumber : '', pname(e.project), e.apt, e.ownerName, e.phone, '+' + e.sentTo, e.test ? 'yes' : '',
    e.title, e.text, e.amount, e.via === 'prompt' ? 'Answered on return' : 'Marked by hand', e.messageId || '', e.at]);
  return xlsxResponse(x, `minawa-whatsapp-log-${today}`);
}
