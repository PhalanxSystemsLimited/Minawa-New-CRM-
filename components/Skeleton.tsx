'use client';
// Skeleton loaders (update 123): while a page is on its way, grey blocks with a soft moving shine stand where its
// header, figures, filters and table will be, shaped like the page being opened (dashboard, building overview,
// apartment, a form, or a list). They show from the loading.tsx files the moment a page is opened and are replaced
// by the real page as soon as it arrives. Without motion (reduced-motion setting) the blocks stay still.
import { usePathname } from 'next/navigation';

type Kind = 'dash' | 'project' | 'apt' | 'form' | 'list';
const kindOf = (p: string): Kind =>
  p === '/' ? 'dash'
  : /^\/p\/[^/]+\/?$/.test(p) ? 'project'
  : /^\/p\/[^/]+\/apartments\/[^/]+/.test(p) ? 'apt'
  : /^\/p\/[^/]+\/(settings|setup)/.test(p) || /^\/admin\/?$/.test(p) ? 'form'
  : 'list';

const B = ({ w = '100%', h = 12, r, className = '' }: { w?: number | string; h?: number; r?: number; className?: string }) =>
  <span className={'sk ' + className} style={{ width: w, height: h, borderRadius: r }} />;

function Head({ tabs }: { tabs?: boolean }) {
  return <>
    <div className="sk-head card"><B w={56} h={56} r={16} /><div className="sk-col"><B w={110} h={10} /><B w={230} h={24} /></div><B w={180} h={12} className="sk-crumb" /></div>
    {tabs ? <div className="sk-tabs">{[72, 96, 84, 90, 70, 88].map((w, i) => <B key={i} w={w} h={30} r={30} />)}</div> : null}
  </>;
}
function Kpis({ n = 4 }: { n?: number }) {
  return <div className="sk-kpis">{Array.from({ length: n }, (_, i) => <div className="card sk-kpi" key={i}><div className="sk-col"><B w="45%" h={10} /><B w="70%" h={26} /><B w="55%" h={10} /></div><B w={40} h={40} r={12} className="sk-ic" /></div>)}</div>;
}
function Table({ rows = 7, cols = 6, title = true }: { rows?: number; cols?: number; title?: boolean }) {
  const ws = ['14%', '22%', '18%', '12%', '16%', '10%', '12%'];
  return <div className="card sk-card">
    {title ? <div className="sk-row-t"><B w={34} h={34} r={10} /><B w={180} h={16} /><span style={{ flex: 1 }} /><B w={110} h={30} r={10} /></div> : null}
    <div className="sk-th">{Array.from({ length: cols }, (_, i) => <B key={i} w={ws[i % ws.length]} h={10} />)}</div>
    {Array.from({ length: rows }, (_, r) => <div className="sk-tr" key={r} style={{ animationDelay: `${r * 60}ms` }}>{Array.from({ length: cols }, (_, i) => <B key={i} w={`calc(${ws[i % ws.length]} - ${(r * 7 + i * 13) % 5 * 2}%)`} h={12} />)}</div>)}
  </div>;
}
function List({ n = 5 }: { n?: number }) {
  return <div className="card sk-card"><div className="sk-row-t"><B w={34} h={34} r={10} /><B w={150} h={16} /></div>
    {Array.from({ length: n }, (_, i) => <div className="sk-li" key={i}><B w={38} h={38} r={38} /><div className="sk-col" style={{ flex: 1 }}><B w={`${70 - i * 6}%`} h={12} /><B w={`${45 - i * 3}%`} h={10} /></div><B w={70} h={22} r={22} /></div>)}
  </div>;
}

export function PageSkeleton() {
  const path = usePathname() || '/', kind = kindOf(path), inProj = path.startsWith('/p/');
  return <div className="sk-page" role="status" aria-live="polite" aria-busy="true"><span className="sr-only">Loading…</span>
    {kind === 'dash' ? <><Head /><Kpis /><div className="sk-grid"><Table rows={6} cols={5} /><List /></div></>
    : kind === 'project' ? <><Head tabs /><Kpis /><div className="sk-grid"><List n={4} /><List n={4} /></div><Table rows={5} /></>
    : kind === 'apt' ? <><Head tabs />
        <div className="card sk-prof"><B w={72} h={72} r={72} /><div className="sk-col" style={{ flex: 1 }}><B w={200} h={20} /><B w={260} h={12} /><div className="sk-chips"><B w={90} h={24} r={24} /><B w={110} h={24} r={24} /><B w={80} h={24} r={24} /></div></div><div className="sk-col sk-prof-r"><B w={90} h={10} /><B w={150} h={28} /></div></div>
        <div className="sk-tabs">{[80, 70, 90, 76].map((w, i) => <B key={i} w={w} h={30} r={30} />)}</div><Table rows={6} /></>
    : kind === 'form' ? <><Head tabs={inProj} />
        <div className="card sk-card">{Array.from({ length: 6 }, (_, i) => <div className="sk-field" key={i}><B w={120} h={10} /><B h={40} r={10} /></div>)}<div className="sk-row-t" style={{ marginTop: 8 }}><span style={{ flex: 1 }} /><B w={130} h={38} r={10} /></div></div></>
    : <><Head tabs={inProj} />
        <div className="card sk-filters"><B w={90} h={30} r={30} /><B w={90} h={30} r={30} /><B w={120} h={30} r={30} /><span style={{ flex: 1 }} /><B w={140} h={36} r={10} /></div>
        <Kpis /><Table /></>}
  </div>;
}
