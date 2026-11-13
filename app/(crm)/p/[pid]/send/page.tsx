// Send on WhatsApp (by hand): the one place to send anything. Three parts: send to owners (pick what and to whom, then
// go through them one at a time; each chat opens with the message typed in), a maintenance notice (was the Notices tab),
// and an announcement to all owners or a block (was in Settings; an accountant's needs an admin's approval).
import { cur, apartments, aptOrder, balance, isAdmin } from '@/lib/engine';
import { rs, fd, fds, t12 } from '@/lib/fmt';
import { NOTICE_PRESETS } from '@/lib/defaults';
import { NoticeComposer } from '@/components/NoticeComposer';
import { sendNoticeAction } from '@/lib/actions-desk';
import { announceAction } from '@/lib/actions';
import { Go, Submit } from '@/components/client';
import { ApprovalItem } from '@/components/views/approvals';
import { waTestNumber } from '@/lib/whatsapp';
import { SEND_TYPES, cantSend, ownerFacts, pendingGroups, appUrl, type SendType } from '@/lib/manual-send';
import { SendConsole, type SendRow } from '@/components/SendConsole';
import { projectPage, projHead } from '@/components/views/project';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { bill: 'Bill', reminder: 'Reminder', notice: 'Final notice', link: 'Payment link', receipt: 'Receipt', alert: 'Maintenance notice', announcement: 'Message', info: 'Message' };

export default async function SendPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), mode = sp.mode === 'notice' || sp.mode === 'announce' ? sp.mode : 'send', base = `/p/${pid}/send`;
    const modes = <div className="ptabs" role="tablist">
      <Go href={base} current={mode === 'send' ? 'true' : 'false'} replace>Send to owners</Go>
      <Go href={`${base}?mode=notice`} current={mode === 'notice' ? 'true' : 'false'} replace>Maintenance notice</Go>
      <Go href={`${base}?mode=announce`} current={mode === 'announce' ? 'true' : 'false'} replace>Announcement</Go>
    </div>;
    if (mode === 'notice') {
      const flats = apartments().filter(o => o.status === 'active').sort(aptOrder).map(o => ({ id: o.id, apt: o.apt, block: o.block, name: o.name, noPhone: o.invalidPhone }));
      const nblocks = [...new Set(flats.map(f => f.block).filter(Boolean))].sort();
      const sent = [...S.notices].reverse().slice(0, 30);
      const msgsOf = (n: typeof sent[number]) => S.messages.filter(m => m.kind === 'alert' && m.d === n.d && m.t === n.t);
      return <>
        {projHead('send')}{modes}
        <div className="page-head"><div><h2>Maintenance notice</h2><p>Tell owners about water or electricity outages, lift maintenance and other work. Pick a type, fill in the details, edit the message if you like, then send it on WhatsApp one owner at a time.</p></div></div>
        <div className="card"><h3>New notice</h3>
          <NoticeComposer presets={NOTICE_PRESETS} flats={flats} blocks={nblocks} project={S.proj.name} pid={pid} action={sendNoticeAction} today={fds(S.today)} hand />
        </div>
        <div className="card"><div className="card-row"><h3>Sent notices</h3><span className="muted" style={{ fontSize: 12.5 }}>last 30</span></div>
          {sent.length ? <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Notice</th><th>Sent to</th><th className="r">Owners</th><th className="r">Sent</th><th>By</th></tr></thead><tbody>
            {sent.map(n => { const ms = msgsOf(n), ok = ms.filter(m => ['sent', 'delivered', 'read'].includes(m.status)).length;
              return <tr key={n.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fd(n.d)}, {t12(n.t)}</td><td><div className="cell-main">{n.title}</div><div className="cell-sub nc-text">{n.text}</div></td><td>{n.audience.length > 60 ? n.audience.slice(0, 60) + '…' : n.audience}</td>
                <td className="r num">{n.count}</td><td className="r num">{ok}{n.failed ? <div className="cell-sub bad-t">{n.failed} no number</div> : null}</td><td className="cell-sub">{n.by}</td></tr>; })}
          </tbody></table></div> : <p className="empty">No notices sent yet.</p>}
        </div>
      </>;
    }
    if (mode === 'announce') {
      const ad = isAdmin(), ablocks = [...new Set(S.owners.filter(o => o.status === 'active').map(o => o.block).filter(Boolean))].sort();
      const waiting = S.approvals.filter(a => a.kind === 'announce' && a.status === 'pending');
      return <>
        {projHead('send')}{modes}
        <div className="page-head"><div><h2>Announcement</h2><p>A message to all owners or one block, such as a change in rates or an AGM date. {ad ? 'It is prepared straight away and waits in To do to be sent one by one.' : 'An admin approves it first; then it waits in To do to be sent one by one.'}</p></div></div>
        {waiting.length ? <div className="card apv-card"><div className="card-row"><h3>Waiting for approval <small>{waiting.length} announcement{waiting.length === 1 ? '' : 's'}</small></h3><Go href="/approvals" className="btn sm">Approvals</Go></div>
          <div className="apv-list">{waiting.map(a => <ApprovalItem key={a.id} v={{ a, apt: '', owner: '', pname: S.proj.name }} admin={ad} meId={S.staffId || ''} back={`${base}?mode=announce`} />)}</div></div> : null}
        <div className="card" id="announce"><h3>New announcement <small>{ad ? '' : 'needs approval'}</small></h3>
          <form action={announceAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><input type="hidden" name="pid" value={pid} />
            <div className="form-row"><label htmlFor="ann-aud">Send to</label><select id="ann-aud" name="aud"><option value="all">All owners ({S.owners.filter(o => o.status === 'active').length})</option>{ablocks.map(b => <option key={b} value={b}>Block {b}</option>)}</select></div>
            <div className="form-row"><label htmlFor="ann-text">Message</label><textarea id="ann-text" name="text" required placeholder="e.g. The AGM is on Sunday 6 December at 4 PM in the community hall."></textarea></div>
            {ad ? null : <div className="form-row"><label htmlFor="why-ann">Reason for the admin <span className="req">(required)</span></label><input id="why-ann" name="why" type="text" required placeholder="Why this announcement is needed" /></div>}
            <div className="m-actions"><Submit pendingText={ad ? 'Preparing…' : 'Sending for approval…'}>{ad ? 'Prepare to send on WhatsApp' : 'Send for approval'}</Submit></div>
          </form>
        </div>
      </>;
    }
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
      {projHead('send')}{modes}
      <div className="page-head"><div><h2>Send on WhatsApp</h2><p>Choose what to send and who gets it. Each owner&apos;s chat then opens in WhatsApp Web with the message already typed: check it and press Send in WhatsApp. When you come back to the CRM it asks <b>Did you send the message?</b>, and your answer goes on the owner&apos;s history and in staff activity.</p></div></div>
      {waTestNumber() ? <div className="callout warn" style={{ marginBottom: 14 }}><div><b>Testing:</b> every chat opens with the test number +{waTestNumber()} (WHATSAPP_TEST_NUMBER), not the owner&apos;s. Remove that setting to message owners.</div></div> : null}
      {localApp ? <div className="callout" style={{ marginBottom: 14 }}><div>Pay Now links point to <b>{app || '(APP_URL not set)'}</b>, which owners can&apos;t open from their phones. They will work once the CRM is online and APP_URL is its public address.</div></div> : null}
      <SendConsole pid={pid} rows={rows} blocks={blocks} types={SEND_TYPES} start={start} ids={sp.ids ? sp.ids.split(',') : []} go={sp.go === '1'} notice={sp.notice || ''} only={sp.kind || ''} waiting={groups.length} />
    </>;
  });
}
