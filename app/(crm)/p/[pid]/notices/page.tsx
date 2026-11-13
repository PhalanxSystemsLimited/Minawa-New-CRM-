// New: maintenance notices staff send on WhatsApp (water outage, electricity, lift, custom), and their history.
import { cur, apartments, aptOrder } from '@/lib/engine';
import { fd, fds, t12 } from '@/lib/fmt';
import { NOTICE_PRESETS } from '@/lib/defaults';
import { NoticeComposer } from '@/components/NoticeComposer';
import { projectPage, projHead } from '@/components/views/project';
import { sendNoticeAction } from '@/lib/actions-desk';

export const dynamic = 'force-dynamic';

export default async function Notices({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    const flats = apartments().filter(o => o.status === 'active').sort(aptOrder).map(o => ({ id: o.id, apt: o.apt, block: o.block, name: o.name, noPhone: o.invalidPhone }));
    const blocks = [...new Set(flats.map(f => f.block).filter(Boolean))].sort();
    const sent = [...S.notices].reverse().slice(0, 30);
    const msgsOf = (n: typeof sent[number]) => S.messages.filter(m => m.kind === 'alert' && m.d === n.d && m.t === n.t);
    return <>
      {projHead('notices')}
      <div className="page-head"><div><h2>Notices</h2><p>Tell owners about water or electricity outages, lift maintenance and other work. Pick a type, fill in the details, edit the message if you like, and send it on WhatsApp.</p></div></div>
      <div className="card"><h3>New notice</h3>
        <NoticeComposer presets={NOTICE_PRESETS} flats={flats} blocks={blocks} project={S.proj.name} pid={pid} action={sendNoticeAction} today={fds(S.today)} hand={!S.settings.rules.autoSend} />
      </div>
      <div className="card"><div className="card-row"><h3>Sent notices</h3><span className="muted" style={{ fontSize: 12.5 }}>last 30</span></div>
        {sent.length ? <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Notice</th><th>Sent to</th><th className="r">Owners</th><th className="r">Delivered</th><th>By</th></tr></thead><tbody>
          {sent.map(n => { const ms = msgsOf(n), ok = ms.filter(m => ['sent', 'delivered', 'read'].includes(m.status)).length;
            return <tr key={n.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fd(n.d)}, {t12(n.t)}</td><td><div className="cell-main">{n.title}</div><div className="cell-sub nc-text">{n.text}</div></td><td>{n.audience.length > 60 ? n.audience.slice(0, 60) + '…' : n.audience}</td>
              <td className="r num">{n.count}</td><td className="r num">{ok}{n.failed ? <div className="cell-sub bad-t">{n.failed} no number</div> : null}</td><td className="cell-sub">{n.by}</td></tr>; })}
        </tbody></table></div> : <p className="empty">No notices sent yet.</p>}
      </div>
    </>;
  });
}
