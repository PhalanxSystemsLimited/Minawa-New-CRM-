// The WhatsApp log as CSV, with the same filters as the page. Admins get everyone; an accountant gets their own.
import { currentStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { todayPKT, addDays } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), g = (k: string) => u.searchParams.get(k) || '';
  const store = await getStore(), staff = await store.listStaff(), projs = await listProjects(), today = todayPKT();
  const per = g('per') || 'all', since = per === 'all' ? null : per === 'today' ? today : addDays(today, -(+per - 1 || 29));
  const who = me.role === 'admin' ? g('who') || 'all' : me.id;
  const ids = who === 'all' ? null : who === 'accountants' ? staff.filter(s => s.role === 'accountant').map(s => s.id) : [who];
  const a = g('a') === 'sent' || g('a') === 'not_sent' ? g('a') as 'sent' | 'not_sent' : null, q = g('q').toLowerCase();
  let list = await store.getWaLog({ project: g('p') || null, staffIds: ids, answer: a, since, limit: 20000 });
  if (q) list = list.filter(e => `${e.apt} ${e.ownerName} ${e.phone} ${e.sentTo} ${e.title} ${e.staffName}`.toLowerCase().includes(q));
  const pname = (id: string) => projs.find(p => p.id === id)?.name || id;
  const lines = [['Date', 'Time', 'Answer', 'Sent by', 'Role', 'Project', 'Apartment', 'Owner', 'Owner number', 'Chat opened with', 'Test', 'Message', 'Text', 'Balance then (Rs)', 'Pay Now link', 'Confirmed', 'Message id', 'Recorded at (UTC)'].map(cell).join(',')];
  for (const e of list) lines.push([e.d, e.t, e.answer === 'sent' ? 'Sent' : 'Opened, not sent', e.staffName, e.staffRole, pname(e.project), e.apt, e.ownerName, e.phone, '+' + e.sentTo, e.test ? 'yes' : '',
    e.title, e.text, e.amount, e.payUrl || '', e.via === 'prompt' ? 'Answered on return' : 'Marked by hand', e.messageId || '', e.at].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-whatsapp-log-${today}.csv"` } });
}
