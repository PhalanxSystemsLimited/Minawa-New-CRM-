// New: every WhatsApp message for this project, with delivery status, errors and resend.
import { cur, ownerById } from '@/lib/engine';
import { fd, diff } from '@/lib/fmt';
import type { Message } from '@/lib/types';
import { Go, A, LiveSearch } from '@/components/client';
import { Submit } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { retryMessageAction } from '@/lib/actions';
import { waConfigured, waTestNumber } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = { read: ['Read', 'good'], delivered: ['Delivered', ''], sent: ['Sent', 'info'], queued: ['Sending', 'warn'], pending: ['To send', 'warn'], failed: ['Failed', 'bad'], skipped: ['Not sent', ''] };
const msgTag = (m: Message) => { const [l, c] = /^Test:/.test(m.error || '') && m.status !== 'failed' ? ['Test only', 'warn'] : m.status === 'sent' && m.waId === 'hand' ? ['Sent by hand', 'info'] : STATUS[m.status] || [m.status, '']; return <span className={`tag ${c}`} title={m.error || ''}>{l}</span>; };

export default async function Messages({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), P = `/p/${pid}/messages`, f = sp.f || 'all', q = (sp.q || '').toLowerCase(), days = +(sp.days || 30);
    const since = S.today, all = S.messages.filter(m => m.from === 'biz' && diff(since, m.d) <= days);
    const count = (k: string) => all.filter(m => k === 'all' ? true : k === 'problems' ? m.status === 'failed' || m.status === 'skipped' : m.status === k).length;
    const list = all.filter(m => (f === 'all' || (f === 'problems' ? m.status === 'failed' || m.status === 'skipped' : m.status === f)))
      .filter(m => { if (!q) return true; const o = ownerById(m.ownerId); return `${o?.apt} ${o?.name} ${m.title} ${m.error || ''}`.toLowerCase().includes(q); }).reverse().slice(0, 300);
    const delivered = all.filter(m => ['delivered', 'read', 'sent'].includes(m.status)).length, failed = count('problems');
    const chips: [string, string][] = [['all', 'All'], ['read', 'Read'], ['delivered', 'Delivered'], ['sent', 'Sent'], ['pending', 'To send'], ['queued', 'Sending'], ['problems', 'Not delivered']];
    return <>
      {projHead('messages')}
      <div className="page-head"><div><h2>WhatsApp messages</h2><p>Bills, reminders, notices, payment links and receipts sent in the last {days} days, and whether they arrived.</p></div>{!S.settings.rules.autoSend ? <Go href={`/p/${pid}/send`} className="btn wa">Send on WhatsApp</Go> : null}</div>
      {!S.settings.rules.autoSend ? <div className="callout" style={{ marginBottom: 14 }}><div><b>Sending by hand.</b> Messages the CRM prepares wait under <b>To send</b> until someone sends them from <A href={`/p/${pid}/send`}>Send on WhatsApp</A>.</div></div> : !waConfigured() ? <div className="callout warn" style={{ marginBottom: 14 }}><div><b>WhatsApp isn&apos;t connected yet.</b> Messages are recorded but not sent. An admin can connect it in <A href="/admin">Staff &amp; connections</A>.</div></div>
        : waTestNumber() ? <div className="callout warn" style={{ marginBottom: 14 }}><div><b>Testing mode:</b> every message goes to +{waTestNumber()}, not to owners. Remove WHATSAPP_TEST_NUMBER to go live.</div></div> : null}
      <div className={`callout ${failed ? 'warn' : 'good'}`} style={{ marginBottom: 14 }}><div><b>{delivered} of {all.length}</b> sent or delivered.{failed ? ` ${failed} didn't go out; fix the number or press Send again.` : ''}</div></div>
      <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
        <LiveSearch name="q" placeholder="Search apartment, owner or error" defaultValue={sp.q || ''} />
        {chips.map(([k, l]) => <Go key={k} href={`${P}?f=${k}${sp.q ? '&q=' + encodeURIComponent(sp.q) : ''}`} className="chipbtn" pressed={f === k} replace>{l} <span className="n">{count(k)}</span></Go>)}
      </div>
        {!list.length ? <p className="empty">No messages match.</p> : <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Apartment</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
          {list.map(m => { const o = ownerById(m.ownerId);
            return <tr key={m.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fd(m.d)}, {m.t}</td><td><A href={ownerHref(o)} className="apt-a">{o?.apt}</A><div className="cell-sub">{o?.name}</div></td>
              <td><div>{m.title}</div><div className="cell-sub">{m.tpl ? `Template: ${S.templates[m.tpl]?.label || m.tpl}` : 'Free text'}{m.pdf ? ' · with PDF' : ''}{m.linkId ? ` · link ${m.linkId}` : ''}</div>{m.error ? <div className="cell-sub bad-t">{m.error}</div> : null}</td>
              <td>{msgTag(m)}</td>
              <td className="r">{m.status === 'failed' || m.status === 'skipped' ? (o?.invalidPhone ? <Go href={ownerHref(o, '?m=fix')} className="btn sm">Fix number</Go> : <form action={retryMessageAction}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="id" value={m.id} /><Submit className="btn sm">Send again</Submit></form>) : null}</td></tr>; })}
        </tbody></table></div>}
      </div>
    </>;
  });
}
