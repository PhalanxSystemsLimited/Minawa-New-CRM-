// WhatsApp (all projects): who sent which message by hand (the WhatsApp log), and, by project, what is waiting, sent
// and not sent. It replaces the separate "WhatsApp messages" and "WhatsApp log" pages.
import { requireStaff } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { diff } from '@/lib/fmt';
import { Go } from '@/components/client';
import { waTestNumber } from '@/lib/whatsapp';
import { WaLogBody } from '@/components/views/walog';

export const dynamic = 'force-dynamic';

export default async function WhatsApp({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams, view = sp.view === 'projects' ? 'projects' : 'log';
  const staff = await requireStaff();
  const head = <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">WhatsApp</div></div><div className="crumb-path">Dashboard<span>/</span>WhatsApp</div></div>
    <div className="ptabs" role="tablist">
      <Go href="/whatsapp" current={view === 'log' ? 'true' : 'false'} replace>Who sent what</Go>
      <Go href="/whatsapp?view=projects" current={view === 'projects' ? 'true' : 'false'} replace>By project</Go>
    </div>
  </>;
  if (view === 'log') return <>{head}<WaLogBody sp={sp} /></>;
  const rows = await Promise.all((await liveProjects()).map(async p => {
    const s = await load(p.id, staff), m = s.messages.filter(x => x.from === 'biz' && diff(s.today, x.d) <= 30);
    const c = (k: string[]) => m.filter(x => k.includes(x.status)).length;
    return { p, total: m.length, ok: c(['sent', 'delivered', 'read']), queued: c(['queued']), pending: c(['pending']), bad: c(['failed', 'skipped']), noNumber: s.owners.filter(o => o.status === 'active' && !o.exempt && o.invalidPhone).length };
  }));
  return <>
    {head}
    <div className="callout" style={{ marginBottom: 14 }}><div><b>Sent by hand.</b> Bills, reminders and receipts wait in each project&apos;s <b>To do</b> until someone sends them from <b>Send on WhatsApp</b>.{waTestNumber() ? <> Testing: chats open with +{waTestNumber()}, not the owners.</> : null}</div></div>
    <div className="card"><div className="card-row"><h3>Last 30 days, by project</h3></div>
      <div className="tbl-wrap"><table><thead><tr><th>Project</th><th className="r">Messages</th><th className="r">Sent</th><th className="r">To send</th><th className="r">Not sent</th><th className="r">Owners with no working number</th><th></th></tr></thead><tbody>
        {rows.map(r => <tr key={r.p.id}><td className="cell-main">{r.p.name}<div className="cell-sub">{r.p.place}</div></td><td className="r num">{r.total}</td><td className="r num">{r.ok}</td><td className="r num">{r.pending + r.queued ? <span className="tag warn">{r.pending + r.queued}</span> : 0}</td><td className="r num">{r.bad ? <span className="tag bad">{r.bad}</span> : 0}</td><td className="r num">{r.noNumber ? <span className="tag warn">{r.noNumber}</span> : 0}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}><Go href={`/p/${r.p.id}/send`} className="btn sm wa">Send</Go> <Go href={`/p/${r.p.id}/messages`} className="btn sm">Open</Go></td></tr>)}
      </tbody></table></div></div>
  </>;
}
