// Activity log (the demo's log drawer, as a page): everything the system and staff did.
import { requireStaff } from '@/lib/session';
import { KindBadges } from '@/components/views/activity';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { dow, fd, t12 } from '@/lib/fmt';
import { GoSelect } from '@/components/client';

export const dynamic = 'force-dynamic';
const GROUPS: Record<string, string[] | null> = { all: null, money: ['payment', 'webhook'], link: ['link'], msg: ['bill', 'message', 'whatsapp'], fine: ['fine', 'flag', 'alert'], job: ['job', 'admin'] };

export default async function Log({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const sp = await searchParams, f = sp.f && sp.f in GROUPS ? sp.f : 'all', pid = sp.p || '';
  const projs = await listProjects();
  const list = await (await getStore()).getLog({ project: pid || null, kinds: GROUPS[f], limit: 400 });
  let day = '';
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Activity log</div></div><div className="crumb-path">Dashboard<span>/</span>Activity log</div></div>
    <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
      <GoSelect name="f" value={f} ariaLabel="What to show" style={{ width: 'auto' }} options={[['all', 'Everything'], ['money', 'Payments and webhooks'], ['link', 'Payment links'], ['msg', 'Bills and messages'], ['fine', 'Fines, flags and alerts'], ['job', 'Daily runs and admin']]} />
      <GoSelect name="p" value={pid} ariaLabel="Project" style={{ width: 'auto' }} options={[['', 'All projects'], ...projs.filter(p => p.live).map(p => [p.id, p.name] as [string, string])]} />
    </div>
      <div className="d-body log-page">{list.length ? list.map(e => { const h = e.d !== day ? (day = e.d, <div className="ev-day">{dow(e.d)} {fd(e.d)}</div>) : null;
        return <div key={e.id}>{h}<div className="ev"><span className="tm">{t12(e.t)}</span><div><KindBadges e={e} />{e.project && !pid ? <b className="ev-p">{projs.find(p => p.id === e.project)?.name}: </b> : null}{e.text}</div></div></div>; }) : <p className="empty">Nothing yet.</p>}</div>
    </div>
  </>;
}
