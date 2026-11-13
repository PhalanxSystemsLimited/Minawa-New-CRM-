// New: set a project up (or add owners to it) from a CSV or the import script's JSON.
import { requireStaff } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, baseTypes } from '@/lib/engine';
import { todayPKT } from '@/lib/fmt';
import { A, Go } from '@/components/client';
import { ImportForm } from '@/components/ImportForm';
import { projHead } from '@/components/views/project';

export const dynamic = 'force-dynamic';

export default async function Setup({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params, staff = await requireStaff();
  const proj = (await listProjects()).find(p => p.id === pid);
  if (!proj) return null;
  const head = proj.live ? use(await load(pid, staff), () => ({ h: projHead('owners', 'Import owners'), types: baseTypes() }))
    : { h: <div className="proj-head"><div><div className="eyebrow-b">Maintenance · {proj.place}</div><div className="proj-title">{proj.name}</div></div><div className="crumb-path"><A href="/">Dashboard</A><span>/</span>Maintenance<span>/</span>{proj.name}<span>/</span>Set up</div></div>, types: [] };
  if (staff.role !== 'admin') return <>{head.h}<div className="card allclear"><div className="big">Admins only</div><p className="muted">Only admins (the CEO and directors) can import owners.</p><Go href={`/p/${pid}`} className="btn">Back</Go></div></>;
  return <>
    {head.h}
    <div className="page-head"><div><h2>{proj.live ? 'Import or update owners' : `Set up ${proj.name}`}</h2><p>{proj.live ? 'Add new apartments, or update owners\' names, WhatsApp numbers and possession dates in one go.' : 'Import the owners, set the rate card and the go-live date. Billing, WhatsApp and Safepay then run here too.'}</p></div></div>
    <ImportForm pid={pid} first={!proj.live} today={todayPKT()} bank={proj.bank} existingTypes={head.types} />
  </>;
}
