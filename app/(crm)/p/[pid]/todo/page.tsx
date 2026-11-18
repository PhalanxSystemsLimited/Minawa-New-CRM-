// To do (the demo's viewFollow): the only things that need a person.
import { cur, ownerById, failedList, fixWaiting } from '@/lib/engine';
import { ResendButton } from '@/components/ResendChat';
import { toDoGroups } from '@/lib/manual-send';
import { fd, fds, rs } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Submit } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { verifyAction, rejectAction, alertDoneAction } from '@/lib/actions';
import { Wa } from '@/components/icons';
import { Empty } from '@/components/views/art';

export const dynamic = 'force-dynamic';

export default async function Todo({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    // Who does this list: the building's manager(s); everyone when the building has none. Bank transfers are the
    // Accountant's (and an Admin's), so a manager doesn't see them here.
    const mgrs = S.managers || [], acts = S.role === 'manager', money = S.role !== 'manager';
    const pr = money ? S.proofs.filter(p => p.status === 'pending') : [], fl = failedList(), al = S.alerts.filter(a => !a.done), ts = toDoGroups(), tsN = ts.reduce((a, g) => a + g.n, 0);
    const held = acts ? S.payments.filter(p => p.collectorId === S.staffId && !p.handoverId && !p.reversed) : [], heldAmt = held.reduce((a, p) => a + p.amount, 0);
    const hid = (id: string) => <><input type="hidden" name="pid" value={pid} /><input type="hidden" name="id" value={id} /></>;
    const head = <div className="page-head"><div><h2>To do</h2><p>{acts ? 'What needs a person. The CRM makes bills, reminders and notices at 11:00 AM; they wait here for you to send one by one on WhatsApp.' : `${mgrs.length ? `Sent by ${mgrs.join(', ')} (building manager).` : 'No building manager is assigned to this building yet: the Admin assigns one in Staff & connections.'} You can follow it here; the sending is theirs.`}</p></div></div>;
    if (!tsN && !pr.length && !fl.length && !al.length && !held.length) return <>{projHead('follow')}{head}<Empty card kind="done" title="All clear">Nothing needs you right now.</Empty></>;
    return <>
      {projHead('follow')}{head}
      {held.length ? <div className="card"><div className="card-row"><h3>Cash to hand over <small>{rs(heldAmt)} · {held.length} confirmed payment{held.length === 1 ? '' : 's'}</small></h3><Go href="/cash" className="btn sm primary">Hand over to the Accountant</Go></div>
        <p className="cell-sub" style={{ margin: 0 }}>The Accountant has confirmed these; give the cash to the Accountant and press Hand over on the Cash page.</p></div> : null}
      {tsN ? <div className="card"><div className="card-row"><h3>Send on WhatsApp <small>{tsN} owner{tsN === 1 ? '' : 's'} waiting · one by one</small></h3>{acts ? <Go href={`/p/${pid}/send?type=queue&kind=all&go=1`} className="btn sm wa"><Wa /> Send all, one by one</Go> : null}</div>
        <div className="list">{ts.map(g => <div className="li" key={g.key}><div className="t"><div className="a">{g.label} · <span className="num">{g.n}</span> owner{g.n === 1 ? '' : 's'}</div><div className="b">{g.hint} · waiting since {fds(g.since)}</div></div>
          {acts ? <Go href={`/p/${pid}/send?type=queue&kind=${g.key}&go=1`} className="btn sm wa"><Wa /> Send {g.n === 1 ? 'it' : 'one by one'}</Go> : <span className="tag warn">{mgrs.length ? `Waiting for ${mgrs[0]}` : 'No building manager yet'}</span>}</div>)}</div>
        <p className="cell-sub" style={{ margin: '10px 0 0' }}>Each owner&apos;s chat opens with the message typed in. When you come back you confirm it was sent, and they leave this list.</p>
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
      {al.length ? <div className="card"><h3>Promises not kept</h3>
        <div className="list">{al.map(a => { const o = ownerById(a.ownerId); return <div className="li" key={a.id}><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name} · {a.text}</div></div><div style={{ display: 'flex', gap: 6 }}><Go href={ownerHref(o)} className="btn sm">Open</Go><form action={alertDoneAction}>{hid(a.id)}<Submit className="btn sm ghost">Done</Submit></form></div></div>; })}</div>
      </div> : null}
    </>;
  });
}
