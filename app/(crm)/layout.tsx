import { Suspense } from 'react';
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, followCount } from '@/lib/engine';
import { Sidebar, Topbar, type NavProject } from '@/components/Shell';
import { signOut } from '../login/actions';
import { WaReturnPrompt } from '@/components/WaReturnPrompt';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const projs = await listProjects();
  const nav: NavProject[] = await Promise.all(projs.map(async p => {
    if (!p.live) return { id: p.id, name: p.name, place: p.place, live: false, todo: 0 };
    const s = await load(p.id, staff);
    return { id: p.id, name: p.name, place: p.place, live: true, todo: use(s, followCount) };
  }));
  const todo = nav.reduce((s, p) => s + p.todo, 0), firstTodo = nav.find(p => p.todo)?.id || null;
  const defaultPid = nav.find(p => p.live)?.id || 'cc';
  return (
    <>
      <div className="app">
        <Suspense><Sidebar projects={nav} admin={staff.role === 'admin'} /></Suspense>
        <div className="side-scrim" data-a="side-close"></div>
        <div className="shell">
          <header className="top">
            <Suspense><Topbar todo={todo} firstTodo={firstTodo} roleLabel={roleName(staff)} initials={staff.role === 'admin' ? 'AD' : 'AC'} name={staff.name} defaultPid={defaultPid} signOut={signOut} /></Suspense>
          </header>
          <div className="layout wrap">
            <main id="main">{children}</main>
          </div>
        </div>
      </div>
      <WaReturnPrompt />
      <p className="foot-note wrap">Minawa Group ERP · Phase 1 maintenance dues · Built by Phalanx Systems</p>
    </>
  );
}
