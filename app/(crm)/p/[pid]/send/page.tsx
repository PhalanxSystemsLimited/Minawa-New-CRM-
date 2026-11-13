// Send on WhatsApp (by hand): pick what to send and to whom, then go through the owners one at a time. Each chat opens
// in WhatsApp Web with the message typed in; the accountant presses Send there, then "Sent, next" here.
import { cur, apartments, aptOrder, balance } from '@/lib/engine';
import { rs, fds } from '@/lib/fmt';
import { waTestNumber } from '@/lib/whatsapp';
import { SEND_TYPES, cantSend, ownerFacts, pendingGroups, appUrl, type SendType } from '@/lib/manual-send';
import { SendConsole, type SendRow } from '@/components/SendConsole';
import { projectPage, projHead } from '@/components/views/project';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { bill: 'Bill', reminder: 'Reminder', notice: 'Final notice', link: 'Payment link', receipt: 'Receipt', alert: 'Maintenance notice', announcement: 'Message', info: 'Message' };

export default async function SendPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    const groups = pendingGroups();
    const waiting = new Map<string, string[]>();
    for (const g of groups) waiting.set(g.msg.ownerId, [...(waiting.get(g.msg.ownerId) || []), KIND[g.msg.kind] || g.msg.title]);
    const lastSent = new Map<string, string>();
    for (const m of S.messages) if (m.from === 'biz' && ['sent', 'delivered', 'read'].includes(m.status)) { const p = lastSent.get(m.ownerId); if (!p || p < m.d) lastSent.set(m.ownerId, m.d); }
    const types = SEND_TYPES.map(t => t.key).filter(k => k !== 'queue') as Exclude<SendType, 'queue'>[];
    const rows: SendRow[] = apartments().filter(o => o.status === 'active').sort(aptOrder).map(o => {
      const f = ownerFacts(o), bal = balance(o);
      return { id: o.id, apt: o.apt, block: o.block || '', name: o.name, phone: o.phone || '', hold: !!o.exempt, bal, balTxt: bal > 0 ? rs(bal) : bal < 0 ? `${rs(-bal)} credit` : 'Paid up',
        overdue: f.overdue, waiting: waiting.get(o.id) || [], last: lastSent.get(o.id) ? fds(lastSent.get(o.id)!) : null, sentToday: lastSent.get(o.id) === S.today,
        why: Object.fromEntries([...types.map(k => [k, cantSend(o, k)]), ['queue', waiting.has(o.id) ? cantSend(o, 'queue') : 'Nothing waiting']]) as Record<SendType, string | null> };
    });
    const blocks = [...new Set(rows.map(r => r.block).filter(Boolean))].sort();
    const app = appUrl(), localApp = !app || /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.\d+\.\d+/.test(app);
    const start = SEND_TYPES.some(t => t.key === sp.type) ? sp.type as SendType : groups.length ? 'queue' : 'link';
    return <>
      {projHead('send')}
      <div className="page-head"><div><h2>Send on WhatsApp</h2><p>Choose what to send and who gets it. Each owner&apos;s chat then opens in WhatsApp Web with the message already typed: check it and press Send in WhatsApp. When you come back to the CRM it asks <b>Did you send the message?</b>, and your answer goes on the owner&apos;s history and in staff activity.</p></div></div>
      {waTestNumber() ? <div className="callout warn" style={{ marginBottom: 14 }}><div><b>Testing:</b> every chat opens with the test number +{waTestNumber()} (WHATSAPP_TEST_NUMBER), not the owner&apos;s. Remove that setting to message owners.</div></div> : null}
      {localApp ? <div className="callout" style={{ marginBottom: 14 }}><div>Pay Now links point to <b>{app || '(APP_URL not set)'}</b>, which owners can&apos;t open from their phones. They will work once the CRM is online and APP_URL is its public address.</div></div> : null}
      <SendConsole pid={pid} rows={rows} blocks={blocks} types={SEND_TYPES} start={start} ids={sp.ids ? sp.ids.split(',') : []} go={sp.go === '1'} notice={sp.notice || ''} waiting={groups.length} />
    </>;
  });
}
