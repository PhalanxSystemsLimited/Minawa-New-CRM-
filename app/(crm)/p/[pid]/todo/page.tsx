// To do (the demo's viewFollow): the only things that need a person.
import { cur, ownerById, failedList, fixWaiting } from '@/lib/engine';
import { voucherRows, DUES } from '@/lib/vouchers';
import { ResendButton } from '@/components/ResendChat';
import { toDoGroups, pendingGroups } from '@/lib/manual-send';
import { fd, fds, rs, t12 } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Submit } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { verifyAction, rejectAction, alertDoneAction } from '@/lib/actions';
import { Wa, Ic } from '@/components/icons';
import { Empty } from '@/components/views/art';

export const dynamic = 'force-dynamic';

export default async function Todo({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    // Who does this list: the building's manager(s); everyone when the building has none. Bank transfers are the
    // Accountant's (and an Admin's), so a manager doesn't see them here.
    const acts = S.role === 'accountant', money = S.role !== 'manager';   // 25 Nov 2026: all of it is the Accountant's
    const pr = money ? S.proofs.filter(p => p.status === 'pending') : [], fl = failedList().filter(m => !(ownerById(m.ownerId).noPhone && DUES.includes(m.kind))), al = S.alerts.filter(a => !a.done), ts = toDoGroups().filter(g => g.key !== 'receipt'), tsN = ts.reduce((a, g) => a + g.n, 0);
    // Receipts: customers who just paid (most urgent), each with its own Send button.
    const rc = pendingGroups(m => m.kind === 'receipt').map(g => ({ m: g.msg, o: ownerById(g.msg.ownerId), p: S.payments.find(x => x.id === g.msg.pdf?.id) })).filter(x => x.o).sort((a, b) => (b.m.d + b.m.t).localeCompare(a.m.d + a.m.t));   // newest first
    const vr = voucherRows().filter(r => r.items.length), vrN = vr.reduce((a, r) => a + r.items.length, 0);
    const held: typeof S.payments = [], heldAmt = held.reduce((a, p) => a + p.amount, 0);
    const hid = (id: string) => <><input type="hidden" name="pid" value={pid} /><input type="hidden" name="id" value={id} /></>;
    const head = <div className="page-head"><div><h2>To do</h2><p>{acts ? 'What needs a person. The CRM makes bills, reminders and notices at 11:00 AM; they wait here for you to send one by one on WhatsApp.' : 'Done by the Accountant: bills, reminders and notices to send, numbers to fix, follow-ups. You can follow it here.'}</p></div></div>;
    if (!rc.length && !vr.length && !tsN && !pr.length && !fl.length && !al.length && !held.length) return <>{projHead('follow')}{head}<Empty card kind="done" title="All clear">Nothing needs you right now.</Empty></>;
    return <>
      {projHead('follow')}{head}
      {rc.length ? <div className="card rc-card" id="receipts"><div className="card-row"><h3 data-hic="receipt" data-tone="green">Receipts to send <small>{rc.length} customer{rc.length === 1 ? '' : 's'} just paid · send first</small></h3>
        {acts && rc.length > 1 ? <Go href={`/p/${pid}/send?type=queue&kind=receipt&go=1`} className="btn sm wa"><Wa /> Send all {rc.length}, one by one</Go> : null}</div>
        <div className="list rc-list">{rc.map(({ m, o, p }) => <div className={'li rc-li' + (m.d < S.today ? ' late' : '')} key={m.id}>
          <span className="rc-ic" aria-hidden="true"><Ic n="receipt" s={20} /></span>
          <div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · {o.name}</div><div className="b">{p ? `${rs(p.amount)} · ${p.receipt} · ${/bank/i.test(p.method) ? 'bank transfer' : 'cash'}${p.enteredBy ? ` · entered by ${p.enteredBy}` : ''}` : m.title}</div></div>
          <div className="rc-when"><b>{m.d === S.today ? t12(m.t) : fds(m.d)}</b>{m.d < S.today ? <span className="tag bad">Waiting since {fds(m.d)}</span> : <span className="tag good">Send now</span>}</div>
          {acts ? <Go href={`/p/${pid}/send?type=queue&kind=receipt&ids=${o.id}&go=1`} className="btn sm wa"><Wa /> Send receipt</Go> : <span className="tag warn">The Accountant&apos;s work</span>}</div>)}</div></div> : null}
      {held.length ? <div className="card"><div className="card-row"><h3>Cash to hand over <small>{rs(heldAmt)} · {held.length} confirmed payment{held.length === 1 ? '' : 's'}</small></h3><Go href="/payments?via=Cash" className="btn sm primary">Hand over to the Accountant</Go></div>
        <p className="cell-sub" style={{ margin: 0 }}>The Accountant has confirmed these; give the cash to the Accountant and press Hand over on the Payments page.</p></div> : null}
      {tsN ? <div className="card"><div className="card-row"><h3>Send on WhatsApp <small>{tsN} owner{tsN === 1 ? '' : 's'} waiting · one by one</small></h3>{acts ? <Go href={`/p/${pid}/send?type=queue&kind=all&go=1`} className="btn sm wa"><Wa /> Send all, one by one</Go> : null}</div>
        <div className="list">{ts.map(g => <div className="li" key={g.key}><div className="t"><div className="a">{g.label} · <span className="num">{g.n}</span> owner{g.n === 1 ? '' : 's'}</div><div className="b">{g.hint} · waiting since {fds(g.since)}</div></div>
          {acts ? <Go href={`/p/${pid}/send?type=queue&kind=${g.key}&go=1`} className="btn sm wa"><Wa /> Send {g.n === 1 ? 'it' : 'one by one'}</Go> : <span className="tag warn">The Accountant&apos;s work</span>}</div>)}</div>
        <p className="cell-sub" style={{ margin: '10px 0 0' }}>Each owner&apos;s chat opens with the message typed in. When you come back you confirm it was sent, and they leave this list.</p>
      </div> : null}
      {vr.length ? <div className="card" id="print"><div className="card-row"><h3 data-hic="print" data-tone="violet">Printed vouchers to deliver <small>{vr.length} customer{vr.length === 1 ? '' : 's'} without WhatsApp · {vrN} paper{vrN === 1 ? '' : 's'}</small></h3>
        {acts ? <Go href={`/p/${pid}/send?mode=print`} className="btn sm primary"><Ic n="print" s={15} /> Print and deliver</Go> : <span className="tag warn">The Accountant&apos;s work</span>}</div>
        <div className="list">{vr.slice(0, 5).map(r => <div className="li" key={r.o.id}><div className="t"><div className="a"><span className="apt-t">{r.o.apt}</span> · {r.o.name}</div><div className="b">{r.items.map(i => i.what).join('; ')} · {r.why.toLowerCase()}</div></div></div>)}</div>
        {vr.length > 5 ? <p className="cell-sub" style={{ margin: '8px 0 0' }}>and {vr.length - 5} more on the Printed vouchers list.</p> : null}
      </div> : null}
      {pr.length ? <div className="card"><h3>Check these bank transfers <small>owners sent a screenshot</small></h3>
        <div className="list">{pr.map(p => { const o = ownerById(p.ownerId); return <div className="li" key={p.id}><div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · <span className="num">{rs(p.amount)}</span></div><div className="b">{o.name} · sent {fd(p.d)}</div></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <form action={verifyAction} style={{ display: 'flex', gap: 6 }}>{hid(p.id)}<input type="hidden" name="amt" value={p.amount} /><Submit className="btn sm primary">It&apos;s in the bank</Submit></form>
            <form action={rejectAction}>{hid(p.id)}<Submit className="btn sm">Can&apos;t find it</Submit></form>
          </div></div>; })}</div>
      </div> : null}
      {fl.length ? <div className="card"><h3>Messages that didn&apos;t arrive</h3>
        <div className="list">{fl.map(m => { const o = ownerById(m.ownerId), fixed = !o.invalidPhone && fixWaiting(m);
          return <div className="li" key={m.id}><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name} · {fixed ? <>number saved ({o.phone}); <b>message not sent yet</b>. It leaves To do once you confirm it was sent.</> : o.noPhone ? 'no WhatsApp number on file' : `${o.phone} is not on WhatsApp`}</div></div>
            {!acts ? null : fixed ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><Go href={ownerHref(o, '?m=fix&from=todo')} className="btn sm">Change number</Go><ResendButton pid={pid} oid={o.id} /></div>
              : <Go href={ownerHref(o, '?m=fix&from=todo')} className="btn sm">{o.noPhone ? 'Add number' : 'Fix number'}</Go>}</div>; })}</div>
      </div> : null}
      {al.length ? <div className="card"><h3>{al.every(a => a.kind === 'entry') ? 'Payments the Accountant didn\'t receive' : al.some(a => a.kind === 'entry') ? 'To follow up' : 'Promises not kept'}</h3>
        <div className="list">{al.map(a => { const o = ownerById(a.ownerId); return <div className="li" key={a.id}><div className="t"><div className="a"><span className="apt-t">{o.apt}</span> {a.kind === 'entry' ? <span className="tag bad">Not received</span> : <span className="tag warn">Promise not kept</span>}</div><div className="b">{o.name} · {a.text}</div></div>{acts ? <div style={{ display: 'flex', gap: 6 }}><Go href={ownerHref(o)} className="btn sm">Open</Go><form action={alertDoneAction}>{hid(a.id)}<Submit className="btn sm ghost">Done</Submit></form></div> : <span className="tag warn">The Accountant&apos;s work</span>}</div>; })}</div>
      </div> : null}
    </>;
  });
}
