// WhatsApp log: every message staff sent by hand on WhatsApp (and every chat they opened but didn't send), as answered
// when they came back to the CRM. Who sent it, to which owner and number, when, what it said and the balance at the time.
// Admins see everyone; an accountant sees their own.
import { requireStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { GoSelect, Go, LiveSearch } from '@/components/client';
import { Ic } from '@/components/icons';
import { initialsOf } from '@/components/views/activity';
import { fd, rs, todayPKT, addDays, dow } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

const PERIODS: [string, string][] = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time']];

export default async function WhatsAppLog({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff(), admin = me.role === 'admin';
  const sp = await searchParams, store = await getStore(), staff = await store.listStaff(), projs = (await listProjects()).filter(p => p.live);
  const today = todayPKT(), per = PERIODS.some(p => p[0] === sp.per) ? sp.per : '30', pid = sp.p || '', ans = sp.a === 'sent' || sp.a === 'not_sent' ? sp.a : '';
  const who = admin ? sp.who || 'all' : me.id, q = (sp.q || '').toLowerCase();
  const since = per === 'all' ? null : per === 'today' ? today : addDays(today, -(+per - 1));
  const ids = who === 'all' ? null : who === 'accountants' ? staff.filter(s => s.role === 'accountant').map(s => s.id) : [who];
  let list: Awaited<ReturnType<typeof store.getWaLog>> = [], err = '';
  try { list = await store.getWaLog({ project: pid || null, staffIds: ids, answer: (ans || null) as 'sent' | 'not_sent' | null, since, limit: 1000 }); }
  catch (e) { err = (e as Error).message; }
  if (q) list = list.filter(e => `${e.apt} ${e.ownerName} ${e.phone} ${e.sentTo} ${e.title} ${e.staffName}`.toLowerCase().includes(q));
  const sent = list.filter(e => e.answer === 'sent'), notSent = list.length - sent.length;
  const owners = new Set(sent.map(e => e.ownerId)).size, people = new Set(list.map(e => e.staffId)).size;
  const pname = (id: string) => projs.find(p => p.id === id)?.name || id;
  const qs = new URLSearchParams(Object.entries({ per, p: pid, a: ans, who: admin ? who : '', q: sp.q || '' }).filter(([, v]) => v)).toString();
  let day = '';
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">WhatsApp log</div></div><div className="crumb-path">Dashboard<span>/</span>WhatsApp log</div></div>
    <div className="page-head"><div><p>Every message sent by hand on WhatsApp, as confirmed with <b>Did you send the message?</b> on returning to the CRM: who sent it, to which owner and number, when, and what it said.{admin ? '' : ' You see the messages you sent.'}</p></div>
      <a className="btn" href={`/api/export/whatsapp?${qs}`}><Ic n="download" s={15} /> Download CSV</a></div>
    {err ? <div className="callout bad" style={{ marginBottom: 14 }}><div>The WhatsApp log can&apos;t be read yet ({err}). Run <b>supabase/migrations/0005_whatsapp_log_and_sheets.sql</b> in Supabase.</div></div> : null}
    <div className="kpis wl-kpis">
      <div className="kpi"><div className="l">Sent</div><div className="v num">{sent.length}</div><div className="cell-sub">{owners} owner{owners === 1 ? '' : 's'}</div></div>
      <div className="kpi"><div className="l">Opened, not sent</div><div className="v num">{notSent}</div></div>
      <div className="kpi"><div className="l">{admin ? 'Staff' : 'Period'}</div><div className="v num">{admin ? people : PERIODS.find(p => p[0] === per)![1]}</div></div>
    </div>
    <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
      <LiveSearch name="q" placeholder="Apartment, owner, number or message" defaultValue={sp.q || ''} />
      {admin ? <GoSelect name="who" value={who} ariaLabel="Sent by" style={{ width: 'auto' }} options={[['all', 'Everyone'], ['accountants', 'All accountants'], ...staff.map(s => [s.id, `${s.name} (${s.role === 'admin' ? 'Admin' : 'Accountant'})`] as [string, string])]} /> : null}
      <GoSelect name="p" value={pid} ariaLabel="Project" style={{ width: 'auto' }} options={[['', 'All projects'], ...projs.map(p => [p.id, p.name] as [string, string])]} />
      <GoSelect name="a" value={ans} ariaLabel="Answer" style={{ width: 'auto' }} options={[['', 'Sent and not sent'], ['sent', 'Sent'], ['not_sent', 'Opened, not sent']]} />
      <GoSelect name="per" value={per} ariaLabel="When" style={{ width: 'auto' }} options={PERIODS} />
    </div>
      {!list.length ? <p className="empty">No WhatsApp messages {ans === 'not_sent' ? 'left unsent' : 'sent'} {per === 'today' ? 'today' : per === 'all' ? 'yet' : `in the last ${per} days`}.</p> :
        <div className="tbl-wrap"><table className="wl-table"><thead><tr><th>Time</th><th>Sent by</th><th>To</th><th>Message</th><th className="r">Balance then</th><th>Answer</th></tr></thead><tbody>
          {list.map(e => { const h = e.d !== day ? (day = e.d, <tr key={e.id + 'h'} className="wl-day"><td colSpan={6}>{dow(e.d)} {fd(e.d)}</td></tr>) : null;
            return [h, <tr key={e.id}>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{e.t}</td>
              <td><div className="act-who"><span className={`act-av${e.staffRole === 'admin' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(e.staffName)}</span><b>{e.staffName}</b></div><div className="cell-sub">{e.staffRole === 'admin' ? 'Admin' : 'Accountant'}</div></td>
              <td><Go href={`/p/${e.project}/apartments/${e.ownerId}`} className="apt-a">{e.apt}</Go><div className="cell-sub">{e.ownerName}</div><div className="cell-sub num">+{e.sentTo}{e.test ? ' · test number' : ''}</div><div className="cell-sub">{pname(e.project)}</div></td>
              <td><div>{e.title}</div><details className="wl-msg"><summary className="cell-sub">Show the message</summary><p>{e.text}</p></details>{e.payUrl ? <div className="cell-sub">Pay Now link {e.linkId}</div> : null}</td>
              <td className="r num">{e.amount > 0 ? rs(e.amount) : e.amount < 0 ? `${rs(-e.amount)} credit` : 'Paid up'}</td>
              <td>{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}{e.test ? <> <span className="tag">Test</span></> : null}<div className="cell-sub">{e.via === 'prompt' ? 'Answered on return' : 'Marked by hand'}</div></td>
            </tr>]; })}
        </tbody></table></div>}
    </div>
  </>;
}
