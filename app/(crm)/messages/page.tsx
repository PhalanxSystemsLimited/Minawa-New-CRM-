// WhatsApp messages across all projects: a summary per project, linking to each project's Messages tab.
import { requireStaff } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { diff } from '@/lib/fmt';
import { Go } from '@/components/client';
import { waTestNumber } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export default async function AllMessages() {
  const staff = await requireStaff();
  const rows = await Promise.all((await liveProjects()).map(async p => {
    const s = await load(p.id, staff), m = s.messages.filter(x => x.from === 'biz' && diff(s.today, x.d) <= 30);
    const c = (k: string[]) => m.filter(x => k.includes(x.status)).length;
    return { p, total: m.length, ok: c(['sent', 'delivered', 'read']), queued: c(['queued']), pending: c(['pending']), bad: c(['failed', 'skipped']), noNumber: s.owners.filter(o => o.status === 'active' && !o.exempt && o.invalidPhone).length };
  }));
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">WhatsApp messages</div></div><div className="crumb-path">Dashboard<span>/</span>WhatsApp messages</div></div>
    <div className="callout" style={{ marginBottom: 14 }}><div><b>Sent by hand.</b> Bills, reminders and receipts wait under <b>To send</b> until someone sends them from each project&apos;s <b>Send on WhatsApp</b> page.{waTestNumber() ? <> Testing: chats open with +{waTestNumber()}, not the owners.</> : null}</div></div>
    <div className="card"><div className="card-row"><h3>Last 30 days, by project</h3></div>
      <div className="tbl-wrap"><table><thead><tr><th>Project</th><th className="r">Messages</th><th className="r">Sent</th><th className="r">To send</th><th className="r">Not delivered</th><th className="r">Owners with no working number</th><th></th></tr></thead><tbody>
        {rows.map(r => <tr key={r.p.id}><td className="cell-main">{r.p.name}<div className="cell-sub">{r.p.place}</div></td><td className="r num">{r.total}</td><td className="r num">{r.ok}</td><td className="r num">{r.pending + r.queued ? <span className="tag warn">{r.pending + r.queued}</span> : 0}</td><td className="r num">{r.bad ? <span className="tag bad">{r.bad}</span> : 0}</td><td className="r num">{r.noNumber ? <span className="tag warn">{r.noNumber}</span> : 0}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}><Go href={`/p/${r.p.id}/send`} className="btn sm wa">Send</Go> <Go href={`/p/${r.p.id}/messages`} className="btn sm">Open</Go></td></tr>)}
      </tbody></table></div></div>
  </>;
}
