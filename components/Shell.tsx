'use client';
// Sidebar and top bar, the demo's markup (renderNav, renderTop). Client components only to know the current page.
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Ic, Wa } from './icons';
import { Go, GlobalSearch } from './client';

export interface NavProject { id: string; name: string; place: string; live: boolean; todo: number; pays?: number; nopos?: number }

export function Sidebar({ projects, admin, role, approvals = 0, me }: { projects: NavProject[]; admin: boolean; role?: string; approvals?: number; me?: { name: string; role: string; signOut: () => Promise<void> } }) {
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
        <Go href="/whatsapp" className="side-i si si-wa" current={path.startsWith('/whatsapp') || path.startsWith('/messages')}><span className="si-ic" aria-hidden="true"><Wa /></span><span className="side-l">WhatsApp</span></Go>
        <Go href="/approvals" className="side-i si si-apv" current={path.startsWith('/approvals')}><span className="si-ic" aria-hidden="true"><Ic n="check" /></span><span className="side-l">Approvals</span>{approvals ? <span className="side-b" title={admin ? `${approvals} waiting for your approval` : `${approvals} of your changes waiting`}>{approvals}</span> : null}</Go>
        {(() => { const n = admin ? 0 : projects.reduce((a, p) => a + (p.todo || 0), 0); return <Go href="/tasks" className="side-i si si-todo" current={path.startsWith('/tasks')}><span className="si-ic" aria-hidden="true"><Ic n="list" /></span><span className="side-l">{admin ? 'Team To do' : 'To do'}</span>{n ? <span className="side-b" title={`${n} task${n === 1 ? '' : 's'} for you`}>{n}</span> : null}</Go>; })()}
        {role !== 'manager' ? <Go href="/received" className="side-i si si-rcv" current={path.startsWith('/received')}><span className="si-ic" aria-hidden="true"><Ic n="wallet" /></span><span className="side-l">Received payments</span></Go> : null}
        {(() => { const n = projects.reduce((a, p) => a + (p.nopos || 0), 0); return <Go href="/possession" className="side-i si si-pos" current={path.startsWith('/possession')}><span className="si-ic" aria-hidden="true"><Ic n="building" /></span><span className="side-l">Possession dates</span>{n ? <span className="side-b" title={`${n} customer${n === 1 ? '' : 's'} with no possession date`}>{n}</span> : null}</Go>; })()}
        <Go href="/cash" className="side-i si si-cash" current={path.startsWith('/cash')}><span className="si-ic" aria-hidden="true"><Ic n="wallet" /></span><span className="side-l">Cash</span></Go>
        <Go href="/reports" className="side-i si si-rpt" current={path.startsWith('/reports')}><span className="si-ic" aria-hidden="true"><Ic n="trend" /></span><span className="side-l">Reports</span></Go>
        <Go href="/log" className="side-i si si-log" current={path.startsWith('/log') || path.startsWith('/admin/activity')}><span className="si-ic" aria-hidden="true"><Ic n="list" /></span><span className="side-l">Activity</span></Go>
        {admin ? <Go href="/admin" className="side-i si si-adm" current={path === '/admin'}><span className="si-ic" aria-hidden="true"><Ic n="shield" /></span><span className="side-l">Staff & connections</span></Go> : null}
      </nav>
      {me ? <div className="side-me"><span className="me-av">{me.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span><div className="side-me-t"><b>{me.name}</b><span>{me.role}</span></div><form action={me.signOut}><button type="submit" className="btn sm">Sign out</button></form></div> : null}
      <div className="side-foot">Phase 1 · Maintenance dues</div>
    </aside>
  );
}

export function Topbar({ todo, firstTodo, bell, roleLabel, initials, name, defaultPid, signOut, projects = [] }: { todo: number; firstTodo: string | null; bell?: { href: string; label: string }; roleLabel: string; initials: string; name: string; defaultPid: string; signOut: () => Promise<void>; projects?: { id: string; name: string }[] }) {
  const path = usePathname(), sp = useSearchParams();
  const pid = path.startsWith('/p/') ? path.split('/')[2] : defaultPid;
  const onApts = path === `/p/${pid}/apartments`;
  return (
    <div className="top-in" id="topbar">
      <button className="icon-btn only-m" data-a="side-open" aria-label="Open menu"><Ic n="menu" /></button>
      <Go href="/" className="m-logo" ariaLabel="Dashboard"><img src="/assets/minawa-mark.png" alt="" /></Go>
      <label className="gsearch"><Ic n="search" s={16} /><GlobalSearch key={onApts ? 'a' : path} base={`/p/${pid}/apartments`} defaultValue={onApts ? sp.get('q') || '' : ''} /></label>
      <span className="top-sp"></span>
      <ThemeSwitch />
      <QuickActions projects={projects} pid={path.startsWith('/p/') ? path.split('/')[2] : null} role={roleLabel} />
      <Go href={bell?.href || (firstTodo ? `/p/${firstTodo}/todo` : `/p/${pid}/todo`)} className="icon-btn bell-btn" title={bell?.label || 'To do'} ariaLabel={`${bell?.label || 'To do'}${todo ? `, ${todo} waiting` : ''}`}><Ic n="bell" />{todo ? <span className="dot-n">{todo}</span> : null}</Go>
      <details className="more me-menu"><summary className="me"><span className="me-av">{initials}</span><div className="me-t"><div className="me-n">{roleLabel}</div><div className="me-r">Minawa Group</div></div></summary>
        <div className="menu menu-r"><div className="menu-who"><b>{name}</b><span>{roleLabel}</span></div><SoundToggle /><form action={signOut}><button type="submit">Sign out</button></form></div>
      </details>
    </div>
  );
}

/** Quick actions. Inside a project they act on that project. Elsewhere (Dashboard, WhatsApp, Approvals, Activity) each
 *  action first asks which project, and the export covers every project. */
function QuickActions({ projects, pid, role }: { projects: { id: string; name: string }[]; pid: string | null; role: string }) {
  const path = usePathname(), ref = useRef<HTMLDetailsElement>(null), [pick, setPick] = useState<string | null>(null);
  useEffect(() => { ref.current?.removeAttribute('open'); setPick(null); }, [path]);   // close after going somewhere
  const here = pid ? projects.find(p => p.id === pid) : null;
  // Sending on WhatsApp is the building manager's work; payments are entered by building managers and accountants.
  const mgr = role === 'Building manager', all: [string, string, (id: string) => string][] = [
    ['link', 'Send dues on WhatsApp', id => `/p/${id}?m=sendpick`],
    ['pay', 'Record a cash payment', id => `/p/${id}/apartments?f=owing`],
    ['ann', 'Send an announcement', id => `/p/${id}/send?mode=announce`],
    ['notice', 'Send a maintenance notice', id => `/p/${id}/send?mode=notice`]
  ];
  const acts = all.filter(([k]) => k === 'pay' ? role !== 'Admin' : mgr);
  return <details ref={ref} className="more qa" onToggle={e => { if (!(e.currentTarget as HTMLDetailsElement).open) setPick(null); }}>
    <summary className="btn primary"><Ic n="plus" s={16} /><span className="lbl">Quick actions</span></summary>
    <div className="menu menu-r qa-menu">
      {here ? <>
        <div className="qa-h">{here.name}</div>
        {acts.map(([k, l, href]) => <Go key={k} href={href(here.id)}>{l}</Go>)}
        <a href={`/api/export/payments?project=${here.id}&per=all`} className="menu-a">Export this project&apos;s payments (CSV)</a>
        <hr />
        <div className="qa-h">All projects</div>
      </> : <>
        <div className="qa-h">Choose a project</div>
        {acts.map(([k, l, href]) => projects.length === 1 ? <Go key={k} href={href(projects[0].id)}>{l}</Go> : <div key={k} className="qa-grp">
          <button type="button" className="qa-open" aria-expanded={pick === k} onClick={() => setPick(pick === k ? null : k)}>{l}<span aria-hidden="true">{pick === k ? '▾' : '›'}</span></button>
          {pick === k ? <div className="qa-sub">{projects.map(p => <Go key={p.id} href={href(p.id)}>{p.name}</Go>)}</div> : null}
        </div>)}
        <hr />
        <div className="qa-h">All projects</div>
      </>}
      <a href="/api/export/payments?per=all" className="menu-a">Export all payments (CSV)</a>
      <Go href="/whatsapp">WhatsApp log</Go>
      <Go href="/approvals">Approvals</Go>
    </div>
  </details>;
}

/** Light, Dark or Frost. The choice is kept in a cookie (read before the page paints, so there is no flash). On phones
 *  only the current theme shows; tapping it moves to the next one. */
type Theme = 'light' | 'dark' | 'frost';
const THEMES: [Theme, string, React.ReactNode][] = [
  ['light', 'Light', <svg key="l" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></svg>],
  ['dark', 'Dark', <svg key="d" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>],
  ['frost', 'Frost', <svg key="f" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5M4 10.5l3.4.9-.9 3.4M20 13.5l-3.4-.9.9-3.4M4 13.5l3.4-.9-.9-3.4M20 10.5l-3.4.9.9 3.4" /></svg>],
];
export function ThemeSwitch() {
  const [t, setT] = useState<Theme>('light');
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )minawa-theme=(dark|frost)/), cur = (m ? m[1] : 'light') as Theme;
    if (cur === 'light') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = cur;
    setT(cur);
  }, []);
  const pick = (k: Theme) => {
    const next = k === t ? THEMES[(THEMES.findIndex(x => x[0] === t) + 1) % THEMES.length][0] : k;
    setT(next);
    const h = document.documentElement;
    h.classList.add('theme-swap'); setTimeout(() => h.classList.remove('theme-swap'), 450);
    if (next === 'light') delete h.dataset.theme; else h.dataset.theme = next;
    document.cookie = `minawa-theme=${next};path=/;max-age=31536000;samesite=lax`;
  };
  return <div className="thm" role="group" aria-label="Theme">
    {THEMES.map(([k, label, ic]) => <button key={k} type="button" className={`thm-b thm-${k}${t === k ? ' on' : ''}`} aria-pressed={t === k} title={`${label} theme`} aria-label={`${label} theme`} onClick={() => pick(k)}>{ic}<span>{label}</span></button>)}
  </div>;
}

/** Notification sound on or off, for this browser (the chime in LivePayments reads the same key). */
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { try { setOn(localStorage.getItem('minawa.sound') !== 'off'); } catch { /* private mode */ } }, []);
  const flip = () => { const v = !on; setOn(v); try { localStorage.setItem('minawa.sound', v ? 'on' : 'off'); } catch { /* private mode */ } };
  return <button type="button" className="menu-link" onClick={flip} aria-pressed={on}>Notification sound: {on ? 'on' : 'off'}</button>;
}
