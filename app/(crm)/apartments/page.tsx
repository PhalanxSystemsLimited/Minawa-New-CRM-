// Apartments (21 Nov 2026): every apartment in the person's buildings (the buildings ticked for them), with buttons to
// pick buildings and to show available apartments, possessed or booked ones, or both. A possessed apartment opens its
// customer; any other opens the apartment (its details and the customers it has had). New possession starts here and
// picks only an available apartment. Only the Admin adds apartments and changes their details. Apartments have no
// dues of their own: what is owed belongs to the customer.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { use, rateTypes, rateFor } from '@/lib/engine';
import { flatList, isFree, custId, type FlatRow } from '@/lib/people';
import { statusTag } from '@/components/views/aptbits';
import { PLAN_LABEL, NEW_PLANS } from '@/lib/types';
import { Go, GoRow, ModalShell, CloseBtn, Submit } from '@/components/client';
import { RowCheck, AllCheck, SelBar } from '@/components/Selection';
import { PossessionModal } from '@/components/views/modals';
import { addAptAction } from '@/lib/actions-people';
import { fds, rs } from '@/lib/fmt';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

interface Row { pid: string; pname: string; f: FlatRow; cid: string }

export default async function Apartments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), admin = me.role === 'admin';
  const all = (await liveProjects(me)), picked = (sp.p || '').split(',').filter(id => all.some(p => p.id === id));
  const shownP = picked.length ? all.filter(p => picked.includes(p.id)) : all;
  const st = sp.st === 'free' || sp.st === 'taken' ? sp.st : '', q = (sp.q || '').trim().toUpperCase();
  const states = await Promise.all(shownP.map(p => load(p.id, me)));
  const rows: Row[] = states.flatMap(s => use(s, () => flatList().map(f => ({ pid: s.project, pname: s.proj.name, f, cid: f.owner ? custId(f.owner) : '' }))));
  const noPos = states.reduce((a, s) => a + s.owners.filter(o => o.status === 'active' && !o.possessionKnown).length, 0);
  const free = rows.filter(r => isFree(r.f)), occ = rows.filter(r => r.f.status === 'occupied'), booked = rows.filter(r => r.f.status === 'booked');
  const list = rows.filter(r => (!st || (st === 'free' ? isFree(r.f) : !isFree(r.f))) && (!q || `${r.f.apt} ${r.f.block} ${r.f.floor} ${r.f.type} ${r.pname} ${r.f.owner?.name || ''} ${r.cid}`.toUpperCase().includes(q)));
  const base = { p: picked.join(','), st, q: sp.q || '' };
  const href = (k: Record<string, string>) => { const u = new URLSearchParams(Object.entries({ ...base, ...k }).filter(([, v]) => v)).toString(); return '/apartments' + (u ? '?' + u : ''); };
  const toggle = (id: string) => { const s = new Set(picked); if (s.has(id)) s.delete(id); else s.add(id); return href({ p: [...s].join(',') }); };
  const exportQ = new URLSearchParams(Object.entries(base).filter(([, v]) => v)).toString();
  const one = shownP.length === 1 ? shownP[0].id : '';

  // The windows: New possession and Add apartment, for one building (asked first when several are shown).
  let modal: React.ReactNode = null;
  const pickBuilding = (m: string, title: string) => <ModalShell title={title} closeKeys={['m']}><div className="callout">Which building?</div>
    <div className="bld-choose">{all.map(p => <Go key={p.id} href={href({ m, p: p.id })} className="btn">{p.name}</Go>)}</div><div className="m-actions"><CloseBtn keys={['m']} /></div></ModalShell>;
  if (sp.m === 'possession') {
    const s = states.find(x => x.project === one);
    modal = s ? use(s, () => PossessionModal({ preset: sp.flat || '', back: href({ p: one }) })) : pickBuilding('possession', 'New possession');
  } else if (sp.m === 'addapt' && admin) {
    const s = states.find(x => x.project === one);
    modal = !s ? pickBuilding('addapt', 'Add apartments') : use(s, () => { const types = rateTypes(), blocks = [...new Set(flatList().map(f => f.block).filter(Boolean))].sort();
      return <ModalShell title={`Add apartments · ${s.proj.name}`} closeKeys={['m']}><form action={addAptAction} className="m-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="pid" value={s.project} /><input type="hidden" name="back" value={href({ p: one })} />
        <div className="callout">Add one apartment, a list (C-301, C-302) or a range (C-301 to C-310). They show as available for new possessions.</div>
        <div className="form-row"><label htmlFor="ap-a">Apartment number <span className="req"> required</span></label><input id="ap-a" name="apts" type="text" required placeholder="e.g. C-301, or C-301 to C-310" autoComplete="off" /></div>
        <div className="grid2" style={{ gap: 10 }}>
          <div className="form-row"><label htmlFor="ap-t">Type <span className="req"> required</span></label><select id="ap-t" name="type" required defaultValue=""><option value="" disabled>Choose the type</option>{types.map(t => <option key={t} value={t}>{t} · {rs(rateFor(t, s.today))} a month</option>)}</select></div>
          <div className="form-row"><label htmlFor="ap-pl">Billing plan for maintenance</label><select id="ap-pl" name="plan" defaultValue="monthly">{NEW_PLANS.map(k => <option key={k} value={k}>{PLAN_LABEL[k]}</option>)}</select><div className="cell-sub">What a new customer starts on; they can choose another at possession.</div></div>
          <div className="form-row"><label htmlFor="ap-b">Block</label><input id="ap-b" name="block" type="text" list="ap-blocks" placeholder="from the number (C-301: C)" /><datalist id="ap-blocks">{blocks.map(b => <option key={b} value={b} />)}</datalist></div>
          <div className="form-row"><label htmlFor="ap-f">Floor</label><input id="ap-f" name="floor" type="text" placeholder="e.g. 3rd, GF, LGF" /></div>
        </div>
        <div className="form-row"><label htmlFor="ap-n">Note (optional)</label><input id="ap-n" name="note" type="text" placeholder="e.g. Corner flat, two parking spaces" /></div>
        <div className="m-actions"><CloseBtn keys={['m']} /><Submit>Add apartments</Submit></div></form></ModalShell>; });
  }

  return <>
    <div className="proj-head"><PageIc n="building" tone="blue" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Apartments</div></div><div className="crumb-path">Dashboard<span>/</span>Apartments</div></div>
    <div className="apt-acts no-print">
      <Go href={href({ m: 'possession', ...(one ? { p: one } : {}) })} className="btn primary"><Ic n="key" s={16} /> New possession</Go>
      {admin ? <Go href={href({ m: 'addapt', ...(one ? { p: one } : {}) })} className="btn"><Ic n="plus" s={16} /> Add apartment</Go> : null}
      <span style={{ flex: 1 }} />
      <Go href={one ? `/customers?p=${one}` : '/customers'} className="btn"><Ic n="users" s={16} /> Customers</Go>
      <Go href="/possession" className="btn"><Ic n="cal" s={16} /> Possession dates{noPos ? <span className="tab-b">{noPos}</span> : null}</Go>
    </div>
    <div className="kpis">
      <div className="kpi"><KIc n="building" tone="blue" /><div className="l">Apartments</div><div className="v num">{rows.length}</div><div className="cell-sub">{shownP.length === all.length ? `${all.length} building${all.length === 1 ? '' : 's'}` : shownP.map(p => p.name).join(', ')}</div></div>
      <div className="kpi"><KIc n="door" tone="amber" /><div className="l">Available</div><div className="v num">{free.length}</div><div className="cell-sub">free for a new possession</div></div>
      <div className="kpi"><KIc n="key" tone="green" /><div className="l">Possessed</div><div className="v num">{occ.length}</div><div className="cell-sub">with a customer now</div></div>
      <div className="kpi"><KIc n="hourglass" tone="violet" /><div className="l">Booked</div><div className="v num">{booked.length}</div><div className="cell-sub">possession waiting for approval</div></div>
    </div>
    <div className="card">
      <div className="apt-filters">
        {all.length > 1 ? <div className="pay-chips"><span className="cell-sub">Buildings</span>
          <Go href={href({ p: '' })} className="chipbtn" pressed={!picked.length} replace>All</Go>
          {all.map(p => <Go key={p.id} href={toggle(p.id)} className="chipbtn" pressed={picked.includes(p.id)} replace>{picked.includes(p.id) ? <Ic n="tick" s={13} /> : null}{p.name}</Go>)}</div> : null}
        <div className="pay-chips"><span className="cell-sub">Show</span>
          <Go href={href({ st: '' })} className="chipbtn" pressed={!st} replace>Both <span className="n">{rows.length}</span></Go>
          <Go href={href({ st: 'free' })} className="chipbtn" pressed={st === 'free'} replace>Available <span className="n">{free.length}</span></Go>
          <Go href={href({ st: 'taken' })} className="chipbtn" pressed={st === 'taken'} replace>Possessed or booked <span className="n">{occ.length + booked.length}</span></Go>
          <span style={{ flex: 1 }} />
          <form method="get" action="/apartments" className="cus-form">{Object.entries({ p: base.p, st }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Apartment, block, type or customer" aria-label="Search apartments" /><button type="submit" className="btn sm"><Ic n="search" s={15} /> Search</button></form>
        </div>
      </div>
      <SelBar id="apt-sel" action="/api/export/apartments" params={base} allHref={`/api/export/apartments${exportQ ? '?' + exportQ : ''}`} noun="apartment" />
      {list.length ? <div className="tbl-wrap"><table className="apt-tbl"><thead><tr><th className="chk"><AllCheck form="apt-sel" /></th><th>Apartment</th>{shownP.length > 1 ? <th>Building</th> : null}<th>Type</th><th>Billing plan</th><th>Status</th><th>Customer</th><th>Customers so far</th></tr></thead><tbody>
        {list.map(r => { const f = r.f, o = f.owner;
          return <GoRow key={r.pid + f.apt} href={o ? `/customers/${r.pid}/${o.id}` : `/apartments/${r.pid}/${encodeURIComponent(f.apt)}`} className={'row-link' + (isFree(f) ? ' apt-free' : '')}>
            <td className="chk" data-l=""><RowCheck form="apt-sel" value={`${r.pid}|${f.apt}`} label={`Select ${f.apt}`} /></td>
            <td data-l="Apartment"><b>{f.apt}</b><div className="cell-sub">{[f.block && `Block ${f.block}`, f.floor].filter(Boolean).join(' · ')}</div></td>
            {shownP.length > 1 ? <td data-l="Building">{r.pname}</td> : null}
            <td data-l="Type">{f.type || '—'}</td>
            <td data-l="Billing plan">{o ? PLAN_LABEL[o.plan || 'monthly'] : f.plan ? PLAN_LABEL[f.plan] : <span className="cell-sub">chosen at possession</span>}</td>
            <td data-l="Status">{statusTag(f)}</td>
            <td data-l="Customer">{o ? <><b>{o.name}</b><div className="cell-sub num">{r.cid} · since {o.possessionKnown ? fds(o.possession) : 'date not on file'}</div></>
              : f.waiting ? <span className="cell-sub">{String(f.waiting.change?.name || '')}, asked by {f.waiting.byName}</span>
              : f.lastName ? <span className="cell-sub">{f.lastName} left{f.leftOn ? ` ${fds(f.leftOn)}` : ''}</span> : <span className="cell-sub">Never possessed</span>}</td>
            <td data-l="Customers so far" className="num">{f.customers.length}</td>
          </GoRow>; })}
      </tbody></table></div>
        : <Empty kind="search" small title={q ? `No apartment matches "${sp.q}"` : st === 'free' ? 'No available apartments' : 'No apartments here yet'}>{admin && !q ? 'Add them with Add apartment.' : null}</Empty>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>A possessed apartment opens its customer (their dues, payments and history). Any other opens the apartment: its details and the customers it has had. Apartments carry no dues of their own.{admin ? '' : ' Only the Admin adds apartments or changes their details.'}</p>
    </div>
    {modal}
  </>;
}
