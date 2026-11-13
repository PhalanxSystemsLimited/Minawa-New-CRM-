'use client';
// Sidebar and top bar, the demo's markup (renderNav, renderTop). Client components only to know the current page.
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Ic } from './icons';
import { Go, GlobalSearch } from './client';

export interface NavProject { id: string; name: string; place: string; live: boolean; todo: number; pays?: number }

export function Sidebar({ projects, admin, approvals = 0 }: { projects: NavProject[]; admin: boolean; approvals?: number }) {
  const path = usePathname();
  const home = path === '/';
  const pid = path.startsWith('/p/') ? path.split('/')[2] : null;
  const [open, setOpen] = useState(true);
  return (
    <aside className="side" id="side" aria-label="Main menu">
      <div className="side-brand"><span className="side-logo"><img src="/assets/minawa-mark.png" alt="" /></span><div><div className="sb1">Minawa Group</div><div className="sb2">ERP · Phase 1</div></div></div>
      <nav className="side-nav" id="nav" aria-label="Sections">
        <div className="side-h">Main</div>
        <Go href="/" className="side-i" current={home}><Ic n="home" /><span className="side-l">Dashboard</span></Go>
        <div className="side-h">Modules</div>
        <button className={'side-i grp' + (pid ? ' in' : '')} aria-expanded={open} aria-controls="navMaint" onClick={() => setOpen(!open)}><Ic n="tool" /><span className="side-l">Maintenance</span><span className="chev" aria-hidden="true"><Ic n="chev" s={16} /></span></button>
        <div className="side-sub" id="navMaint" hidden={!open}>
          {projects.map(p => (
            <Go key={p.id} href={`/p/${p.id}`} className={'side-p' + (p.live ? '' : ' off')} current={pid === p.id}>
              <span className="side-l">{p.name}<small>{p.place}{p.live ? '' : ' · not set up'}</small></span>{p.pays && !path.startsWith(`/p/${p.id}/payments`) ? <span className="side-pay" title={`${p.pays} new payment${p.pays === 1 ? '' : 's'}: open Payments to see them`}>{p.pays}</span> : null}{p.todo ? <span className="side-b" title={`${p.todo} to do`}>{p.todo}</span> : null}
            </Go>))}
        </div>
        <div className="side-h">System</div>
        <Go href="/whatsapp" className="side-i" current={path.startsWith('/whatsapp') || path.startsWith('/messages')}><Ic n="phone" /><span className="side-l">WhatsApp</span></Go>
        <Go href="/approvals" className="side-i" current={path.startsWith('/approvals')}><Ic n="check" /><span className="side-l">Approvals</span>{approvals ? <span className="side-b" title={admin ? `${approvals} waiting for your approval` : `${approvals} of your changes waiting`}>{approvals}</span> : null}</Go>
        <Go href="/log" className="side-i" current={path.startsWith('/log') || path.startsWith('/admin/activity')}><Ic n="list" /><span className="side-l">Activity</span></Go>
        {admin ? <Go href="/admin" className="side-i" current={path === '/admin'}><Ic n="shield" /><span className="side-l">Staff & connections</span></Go> : null}
      </nav>
      <div className="side-foot">Phase 1 · Maintenance dues</div>
    </aside>
  );
}

export function Topbar({ todo, firstTodo, roleLabel, initials, name, defaultPid, signOut }: { todo: number; firstTodo: string | null; roleLabel: string; initials: string; name: string; defaultPid: string; signOut: () => Promise<void> }) {
  const path = usePathname(), sp = useSearchParams();
  const pid = path.startsWith('/p/') ? path.split('/')[2] : defaultPid;
  const onApts = path === `/p/${pid}/apartments`;
  return (
    <div className="top-in" id="topbar">
      <button className="icon-btn only-m" data-a="side-open" aria-label="Open menu"><Ic n="menu" /></button>
      <label className="gsearch"><Ic n="search" s={16} /><GlobalSearch key={onApts ? 'a' : path} base={`/p/${pid}/apartments`} defaultValue={onApts ? sp.get('q') || '' : ''} /></label>
      <span className="top-sp"></span>
      <details className="more qa"><summary className="btn primary"><Ic n="plus" s={16} /><span className="lbl">Quick actions</span></summary><div className="menu menu-r">
        <Go href={`/p/${pid}?m=sendpick`}>Send a payment link</Go>
        <Go href={`/p/${pid}/apartments?f=owing`}>Record a payment</Go>
        <Go href={`/p/${pid}/send?mode=announce`}>Send an announcement</Go>
        <a href={`/api/export/payments?project=${pid}&per=all`} className="menu-a">Export payments (CSV)</a>
      </div></details>
      <Go href={firstTodo ? `/p/${firstTodo}/todo` : `/p/${pid}/todo`} className="icon-btn" title="To do" ariaLabel={`To do${todo ? `, ${todo} waiting` : ''}`}><Ic n="bell" />{todo ? <span className="dot-n">{todo}</span> : null}</Go>
      <details className="more me-menu"><summary className="me"><span className="me-av">{initials}</span><div className="me-t"><div className="me-n">{roleLabel}</div><div className="me-r">Minawa Group</div></div></summary>
        <div className="menu menu-r"><div className="menu-who"><b>{name}</b><span>{roleLabel}</span></div><form action={signOut}><button type="submit">Sign out</button></form></div>
      </details>
    </div>
  );
}
