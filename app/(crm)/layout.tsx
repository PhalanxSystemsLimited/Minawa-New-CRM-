import { Suspense } from 'react';
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { projectTasks, myTasks } from '@/lib/tasks';
import { Sidebar, Topbar, type NavProject } from '@/components/Shell';
import { signOut } from '../login/actions';
import { MobileBar, MobileTables } from '@/components/Mobile';
import { LiveEffects } from '@/components/Live';
import { WaReturnPrompt } from '@/components/WaReturnPrompt';
import { LivePayments } from '@/components/LivePayments';
import { NavProgress } from '@/components/NavProgress';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ManagerShell } from '@/components/views/manager';
import { payKey, paySeenCookie, NEW_DAYS } from '@/lib/pay-seen';
import { addDays, todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  // 25–26 Nov 2026: a building manager has one screen, Payment requests (from his accountant). Any other page,
  // old link or bookmark brings him back to it.
  if (staff.role === 'manager') {
    const path = (await headers()).get('x-path') || '/';
    if (path !== '/') redirect('/');
    return <ManagerShell staff={staff} signOut={signOut}>{children}</ManagerShell>;
  }
  const projs = await listProjects(staff);
  // Approvals waiting: all of them for admins, your own for accountants.
  let approvals = 0;
  const jar = await cookies();
  const nav: NavProject[] = await Promise.all(projs.map(async p => {
    if (!p.live) return { id: p.id, name: p.name, place: p.place, live: false, todo: 0 };
    const s = await load(p.id, staff);
    approvals += s.approvals.filter(a => a.status === 'pending' && (staff.role === 'admin' || a.byId === staff.id)).length;
    // Payments this person hasn't seen on the project's Payments page yet.
    const since = jar.get(paySeenCookie(staff.id, p.id))?.value || addDays(todayPKT(), -NEW_DAYS) + 'T00:00';
    const pays = s.payments.filter(x => payKey(x) > since).length;
    const nopos = s.owners.filter(o => o.status === 'active' && !o.possessionKnown).length;
    return { id: p.id, name: p.name, place: p.place, live: true, todo: myTasks(projectTasks(s), staff).length, pays, nopos };
  }));
  // The bell: an Admin's approvals; everyone else's own To do (see lib/tasks.ts).
  const admin = staff.role === 'admin', todo = admin ? approvals : nav.reduce((s, p) => s + p.todo, 0), firstTodo = nav.find(p => p.todo)?.id || null;
  const defaultPid = nav.find(p => p.live)?.id || 'cc';
  return (
    <>
      <LiveEffects />
      <div className="app">
        <Suspense><Sidebar projects={nav} admin={admin} role={staff.role} approvals={approvals} me={{ name: staff.name, role: roleName(staff), signOut }} /></Suspense>
        <div className="side-scrim" data-a="side-close"></div>
        <div className="shell">
          <header className="top">
            <Suspense><Topbar todo={todo} firstTodo={firstTodo} bell={admin ? { href: '/approvals', label: 'Approvals' } : { href: '/tasks', label: 'To do' }} roleLabel={roleName(staff)} initials={admin ? 'AD' : 'AC'} name={staff.name} defaultPid={defaultPid} signOut={signOut} projects={nav.filter(p => p.live).map(p => ({ id: p.id, name: p.name }))} /></Suspense>
          </header>
          <div className="layout wrap">
            <main id="main">{children}</main>
          </div>
          <p className="foot-note wrap">Minawa Group ERP · Phase 1 maintenance dues · Built by Phalanx Systems</p>
        </div>
      </div>
      <Suspense><MobileBar projects={nav} defaultPid={defaultPid} manager={staff.role === 'accountant'} /></Suspense>
      <MobileTables />
      <WaReturnPrompt />
      <Suspense><NavProgress /></Suspense>
      <LivePayments me={staff.id} counts={Object.fromEntries(nav.filter(p => p.live).map(p => [p.id, p.pays || 0]))} />
    </>
  );
}
