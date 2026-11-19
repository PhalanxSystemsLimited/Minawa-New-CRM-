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
import { SEND_TYPES, cantSend, ownerFacts, pendingGroups, type SendType } from '@/lib/manual-send';
import { SendConsole, type SendRow } from '@/components/SendConsole';
import { VoucherBatch } from '@/components/VoucherBatch';
import { voucherRows } from '@/lib/vouchers';
import { projectPage, projHead } from '@/components/views/project';

import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { activeNumbers, fmtNumber } from '@/lib/wa-numbers';
import { diff } from '@/lib/fmt';
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { bill: 'Bill', reminder: 'Reminder', notice: 'Late warning', link: 'Dues', receipt: 'Receipt', alert: 'Maintenance notice', announcement: 'Message', info: 'Message' };

export default async function SendPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  const me = await requireStaff();
  if (me.role !== 'manager') redirect(`/p/${pid}?flash=${encodeURIComponent('Sending on WhatsApp is the building manager\'s work.')}`);
  // The person's WhatsApp numbers and how much of each one's daily limit is used (20 Nov 2026).
  const nums = activeNumbers(me);
  let usage: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['waUsage']>> = [];
  try { usage = await (await getStore()).waUsage(nums.map(n => ({ number: n.number, limit: n.limit }))); } catch (e) { console.error('wa usage', (e as Error).message); }
  const numbers = nums.map(n => ({ number: n.number, label: n.label, limit: n.limit, shown: fmtNumber(n.number) }));
  return projectPage(pid, sp, () => {
    const S = cur(), mode = sp.mode === 'notice' || sp.mode === 'announce' || sp.mode === 'print' ? sp.mode : 'send', base = `/p/${pid}/send`;
    const vrows = voucherRows(), vN = vrows.filter(r => r.items.length).length;
    const modes = <div className="ptabs" role="tablist">
      <Go href={base} current={mode === 'send' ? 'true' : 'false'} replace>Send to owners</Go>
      <Go href={`${base}?mode=notice`} current={mode === 'notice' ? 'true' : 'false'} replace>Maintenance notice</Go>
      <Go href={`${base}?mode=announce`} current={mode === 'announce' ? 'true' : 'false'} replace>Announcement</Go>
      <Go href={`${base}?mode=print`} current={mode === 'print' ? 'true' : 'false'} replace>Printed vouchers{vN ? <> <span className="tab-b">{vN}</span></> : null}</Go>
    </div>;
    if (mode === 'print') return <>
      {projHead('send')}{modes}
      <div className="page-head"><div><h2>Printed vouchers</h2><p>For customers without WhatsApp ({vrows.length} here: no number, or a number not on WhatsApp). Their bills, late warnings and receipts wait here instead of on WhatsApp: print them in one PDF, deliver them by hand, then mark them delivered. This system sends no email.</p></div></div>
      <VoucherBatch pid={pid} rows={vrows.map(r => ({ oid: r.o.id, apt: r.o.apt, block: r.o.block || '', name: r.o.name, why: r.why, bal: r.bal > 0 ? rs(r.bal) : r.bal < 0 ? `${rs(-r.bal)} credit` : 'Paid up', owes: r.bal > 0,
        items: r.items.map(i => ({ key: i.msg.id, ids: i.ids, what: i.what, since: fds(i.msg.d) })) }))} />
    </>;
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
    const start = SEND_TYPES.some(t => t.key === sp.type) ? sp.type as SendType : groups.length ? 'queue' : 'link';
    return <>
      {projHead('send')}{modes}
      <div className="page-head"><div><h2>Send on WhatsApp</h2><p>Choose what to send and who gets it. Each owner&apos;s chat then opens in WhatsApp Web with the message already typed: check it and press Send in WhatsApp. When you come back to the CRM it asks <b>Did you send the message?</b>, and your answer goes on the owner&apos;s history and in staff activity.</p></div></div>
      {waTestNumber() ? <div className="callout warn" style={{ marginBottom: 14 }}><div><b>Testing:</b> every chat opens with the test number +{waTestNumber()} (WHATSAPP_TEST_NUMBER), not the owner&apos;s. Remove that setting to message owners.</div></div> : null}
      <SendConsole pid={pid} rows={rows} blocks={blocks} types={SEND_TYPES} start={start} ids={sp.ids ? sp.ids.split(',') : []} go={sp.go === '1'} notice={sp.notice || ''} only={sp.kind || ''} waiting={groups.length}
        numbers={numbers} usage={usage} plan={(() => {
          // Sending plan: enough bills each day to send every waiting bill before its due date.
          const dues = groups.filter(g => g.msg.kind === 'bill').map(g => S.bills.find(b => b.id === g.msg.pdf?.id)?.dueDate).filter((d): d is string => !!d).sort();
          const late = dues.filter(d => d <= S.today).length, ahead = dues.filter(d => d > S.today);
          let need = 0; ahead.forEach((d, k) => { need = Math.max(need, Math.ceil((k + 1) / diff(d, S.today))); });
          const parts = [late ? `${late} bill${late === 1 ? ' is' : 's are'} due today or already past due: send ${late === 1 ? 'it' : 'them'} first.` : '',
            need ? `Then at least ${need} a day sends the other ${ahead.length} before their due dates.` : ''].filter(Boolean);
          if (!late && need) parts[0] = `Send at least ${need} bill${need === 1 ? '' : 's'} a day to send all ${ahead.length} waiting before their due dates.`;
          return parts.length ? parts.join(' ') : null;
        })()} />
    </>;
  });
}
