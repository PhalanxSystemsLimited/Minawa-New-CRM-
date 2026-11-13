// Shared frame for a project's pages: the header with tabs (the demo's projHead), the "not set up" page,
// and the modals that any project page can open from the address.
import type { State } from '@/lib/types';
import { cur, ownerById, followCount, currentOf, hasGenerator } from '@/lib/engine';
import { use } from '@/lib/engine';
import { pendingCount } from '@/lib/manual-send';
import { requireStaff } from '@/lib/session';
import { load, projects as listProjects } from '@/lib/ops';
import { Go, A } from '../client';
import { DocModal, OwnerModal, SendPickModal, TargetModal, PossessionModal } from './modals';

export type Tab = 'dashboard' | 'owners' | 'payments' | 'utilities' | 'notices' | 'generator' | 'send' | 'follow' | 'messages' | 'settings';
const TABS: [Tab, string, string][] = [['dashboard', 'Overview', ''], ['owners', 'Apartments', '/apartments'], ['payments', 'Payments', '/payments'], ['utilities', 'Utility bills', '/utilities'], ['notices', 'Notices', '/notices'], ['generator', 'Generator charges', '/generator'], ['send', 'Send on WhatsApp', '/send'], ['follow', 'To do', '/todo'], ['messages', 'Messages', '/messages'], ['settings', 'Settings', '/settings']];
export const TITLES: Record<Tab, string> = { dashboard: 'Overview', owners: 'Apartments', payments: 'Payments', utilities: 'Utility bills', notices: 'Notices', generator: 'Generator charges', send: 'Send on WhatsApp', follow: 'To do', messages: 'Messages', settings: 'Settings' };

export function projHead(tab: Tab, ownerTitle?: string) {
  const S = cur(), p = S.proj, n = followCount(), w = pendingCount();
  const t = ownerTitle || TITLES[tab] || 'Overview';
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Maintenance · {p.place}</div><div className="proj-title">{p.name}</div></div>
      <div className="crumb-path"><A href="/">Dashboard</A><span>/</span>Maintenance<span>/</span>{p.name}<span>/</span>{ownerTitle ? <>Apartments<span>/</span></> : null}{t}</div></div>
    <nav className="proj-tabs" aria-label={`${p.name} maintenance`}>{TABS.filter(([k]) => (k !== 'utilities' || S.settings.rules.utilities.length) && (k !== 'generator' || hasGenerator())).map(([k, l, sub]) =>
      <Go key={k} href={`/p/${p.id}${sub}`} current={tab === k}>{l}{k === 'follow' && n ? <> <span className="tab-b">{n}</span></> : k === 'send' && w ? <> <span className="tab-b">{w}</span></> : null}</Go>)}</nav>
  </>;
}

/** Loads the project and renders it, or the "not set up" page. Adds any modal named in the address. */
export async function projectPage(pid: string, sp: Record<string, string | undefined>, render: (s: State) => React.ReactNode) {
  const staff = await requireStaff();
  const proj = (await listProjects()).find(p => p.id === pid);
  if (!proj) return <div className="card allclear"><div className="big">No such project</div><Go href="/" className="btn">Back to the dashboard</Go></div>;
  if (!proj.live) return notSetUp(proj.id, proj.name, proj.place, proj.kind, staff.role === 'admin');
  const s = await load(pid, staff);
  return use(s, () => {
    const body = render(s);
    let modal: React.ReactNode = null;
    if (sp.doc) modal = DocModal({ doc: sp.doc, flash: sp.flash });
    else if (sp.m === 'target') modal = TargetModal();
    else if (sp.m === 'sendpick') modal = SendPickModal();
    else if (sp.m === 'possession') modal = PossessionModal();
    else if (sp.m && sp.oid) { const o = ownerById(sp.oid); if (o) modal = OwnerModal({ m: sp.m, o: currentOf(o) }); }
    return <>{body}{modal}</>;
  });
}

function notSetUp(pid: string, name: string, place: string, kind: string, admin: boolean) {
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Maintenance · {place}</div><div className="proj-title">{name}</div></div><div className="crumb-path"><A href="/">Dashboard</A><span>/</span>Maintenance<span>/</span>{name}</div></div>
    <div className="card allclear"><div className="big">Maintenance isn&apos;t set up here yet</div>
      <p className="muted" style={{ margin: '0 auto 14px', maxWidth: 520 }}>{name} ({kind.toLowerCase()}, {place}) joins once its owners, rates and opening balances are imported, the same way as Country Club. Billing, WhatsApp and Safepay then work here too.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {admin ? <Go href={`/p/${pid}/setup`} className="btn primary">Set up this project</Go> : null}
        <Go href="/" className="btn">Back to the dashboard</Go>
      </div></div>
  </>;
}
