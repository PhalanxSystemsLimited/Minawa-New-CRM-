// To do (the demo's viewFollow): the only things that need a person.
import { cur, ownerById, failedList } from '@/lib/engine';
import { fd, rs } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Submit } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { verifyAction, rejectAction, alertDoneAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Todo({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    const pr = S.proofs.filter(p => p.status === 'pending'), fl = failedList(), al = S.alerts.filter(a => !a.done);
    const hid = (id: string) => <><input type="hidden" name="pid" value={pid} /><input type="hidden" name="id" value={id} /></>;
    const head = <div className="page-head"><div><h2>To do</h2><p>The only things that need a person. Everything else runs on its own.</p></div></div>;
    if (!pr.length && !fl.length && !al.length) return <>{projHead('follow')}{head}<div className="card allclear"><div style={{ fontSize: 34 }}>✓</div><div className="big">All clear</div><p className="muted" style={{ margin: 0 }}>Nothing needs you right now.</p></div></>;
    return <>
      {projHead('follow')}{head}
      {pr.length ? <div className="card"><h3>Check these bank transfers <small>owners sent a screenshot</small></h3>
        <div className="list">{pr.map(p => { const o = ownerById(p.ownerId); return <div className="li" key={p.id}><div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · <span className="num">{rs(p.amount)}</span></div><div className="b">{o.name} · sent {fd(p.d)}{p.media ? <> · <a href={`/api/whatsapp/media/${encodeURIComponent(p.media)}`} target="_blank" rel="noopener">See screenshot</a></> : null}</div></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <form action={verifyAction} style={{ display: 'flex', gap: 6 }}>{hid(p.id)}<input type="hidden" name="amt" value={p.amount} /><Submit className="btn sm primary">It&apos;s in the bank</Submit></form>
            <form action={rejectAction}>{hid(p.id)}<Submit className="btn sm">Can&apos;t find it</Submit></form>
          </div></div>; })}</div>
      </div> : null}
      {fl.length ? <div className="card"><h3>Messages that didn&apos;t arrive</h3>
        <div className="list">{fl.map(m => { const o = ownerById(m.ownerId); return <div className="li" key={m.id}><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name} · {o.noPhone ? 'no WhatsApp number on file' : `${o.phone} is not on WhatsApp`}</div></div><Go href={ownerHref(o, '?m=fix')} className="btn sm">{o.noPhone ? 'Add number' : 'Fix number'}</Go></div>; })}</div>
      </div> : null}
      {al.length ? <div className="card"><h3>Promises not kept</h3>
        <div className="list">{al.map(a => { const o = ownerById(a.ownerId); return <div className="li" key={a.id}><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name} · {a.text}</div></div><div style={{ display: 'flex', gap: 6 }}><Go href={ownerHref(o)} className="btn sm">Open</Go><form action={alertDoneAction}>{hid(a.id)}<Submit className="btn sm ghost">Done</Submit></form></div></div>; })}</div>
      </div> : null}
    </>;
  });
}
