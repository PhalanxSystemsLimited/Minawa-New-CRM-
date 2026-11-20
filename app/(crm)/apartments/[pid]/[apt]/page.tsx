// One apartment (21 Nov 2026): its details, who has it now (or the possession waiting for approval), and every
// customer it has had, each linking to their own page with their dues and history. The apartment itself carries no
// dues. Available: New possession starts here with this apartment picked. Only the Admin edits or removes it.
import { cur, rateTypes, rateFor } from '@/lib/engine';
import { flatByApt, custId, isFree } from '@/lib/people';
import { PLAN_LABEL, NEW_PLANS } from '@/lib/types';
import { fd, rs } from '@/lib/fmt';
import { Go, A, ModalShell, CloseBtn, Submit } from '@/components/client';
import { projectPage } from '@/components/views/project';
import { statusTag } from '@/components/views/aptbits';
import { editAptAction, removeAptAction } from '@/lib/actions-people';
import { PageIc } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function Apartment({ params, searchParams }: { params: Promise<{ pid: string; apt: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, apt: raw } = await params, sp = await searchParams, apt = decodeURIComponent(raw);
  const path = `/apartments/${pid}/${encodeURIComponent(apt)}`;
  // New possession from here: this apartment already picked, and back here afterwards.
  const sp2 = sp.m === 'possession' ? { ...sp, flat: sp.flat || apt, pp: sp.pp || path } : sp;
  return projectPage(pid, sp2, () => {
    const S = cur(), f = flatByApt(apt), admin = S.role === 'admin';
    const head = (title: string, sub: string) => <div className="proj-head"><PageIc n="building" tone="blue" /><div><div className="eyebrow-b">{sub}</div><div className="proj-title">{title}</div></div>
      <div className="crumb-path"><A href="/">Dashboard</A><span>/</span><A href={`/apartments?p=${pid}`}>Apartments</A><span>/</span>{title}</div></div>;
    if (!f) return <>{head(apt, S.proj.name)}<div className="card allclear"><div className="big">{apt} isn&apos;t one of {S.proj.name}&apos;s apartments</div><Go href={`/apartments?p=${pid}`} className="btn">← Apartments</Go></div></>;
    const o = f.owner, w = f.waiting, list = [...f.customers].sort((a, b) => (b.possession || '').localeCompare(a.possession || ''));
    const kv = (rows: [string, React.ReactNode][]) => <div className="kv cus-kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v ?? '—'}</b></div>)}</div>;
    const edit = admin && sp.m === 'editapt' ? <ModalShell title={`Edit apartment ${f.apt}`} closeKeys={['m']}><form action={editAptAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="pid" value={pid} /><input type="hidden" name="apt" value={f.apt} />
      {f.customers.length || w ? null : <div className="form-row"><label htmlFor="ea-a">Apartment number</label><input id="ea-a" name="newApt" type="text" defaultValue={f.apt} required /><div className="cell-sub">Can change only while nobody has had it.</div></div>}
      <div className="grid2" style={{ gap: 10 }}>
        <div className="form-row"><label htmlFor="ea-t">Type</label><select id="ea-t" name="type" defaultValue={rateTypes().includes(f.type) ? f.type : ''}>{rateTypes().includes(f.type) ? null : <option value="">{f.type || 'Choose'}</option>}{rateTypes().map(t => <option key={t} value={t}>{t} · {rs(rateFor(t, S.today))} a month</option>)}</select></div>
        <div className="form-row"><label htmlFor="ea-pl">Billing plan for maintenance</label><select id="ea-pl" name="plan" defaultValue={f.plan || ''}><option value="">Not set (chosen at possession)</option>{NEW_PLANS.map(k => <option key={k} value={k}>{PLAN_LABEL[k]}</option>)}</select></div>
        <div className="form-row"><label htmlFor="ea-b">Block</label><input id="ea-b" name="block" type="text" defaultValue={f.block} /></div>
        <div className="form-row"><label htmlFor="ea-f">Floor</label><input id="ea-f" name="floor" type="text" defaultValue={f.floor} /></div>
      </div>
      <div className="form-row"><label htmlFor="ea-n">Note</label><input id="ea-n" name="note" type="text" defaultValue={f.note || ''} /></div>
      {o ? <div className="callout warn"><div>{o.name} has this apartment now. Their monthly fee and billing plan don&apos;t change here: change them with Edit on the customer (the Admin approves).</div></div> : null}
      <div className="m-actions"><CloseBtn keys={['m']} /><Submit>Save</Submit></div></form></ModalShell> : null;
    return <>
      {head(f.apt, `Apartment · ${S.proj.name}`)}
      <div className="cus-acts no-print">
        {isFree(f) ? <Go href={`${path}?m=possession`} className="btn primary"><Ic n="key" s={16} /> New possession of {f.apt}</Go> : null}
        {o ? <Go href={`/customers/${pid}/${o.id}`} className="btn primary"><Ic n="users" s={16} /> {o.name}&apos;s details</Go> : null}
        {admin ? <Go href={`${path}?m=editapt`} className="btn"><Ic n="edit" s={15} /> Edit apartment</Go> : null}
        {admin && !f.customers.length && !w && f.def ? <form action={removeAptAction} style={{ display: 'inline' }}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="apt" value={f.apt} /><Submit className="btn ghost" pendingText="Removing…">Remove apartment</Submit></form> : null}
        <Go href={`/apartments?p=${pid}`} className="btn ghost">← All apartments</Go>
      </div>
      <div className="grid2">
        <div className="card"><h3 data-hic="building" data-tone="blue">Apartment details</h3>
          {kv([['Apartment', f.apt], ['Building', S.proj.name], ['Block', f.block || '—'], ['Floor', f.floor || '—'], ['Type', f.type || '—'],
            ['Monthly fee', f.type && rateTypes().includes(f.type) ? `${rs(rateFor(f.type, S.today))} (rate card)` : '—'], ['Billing plan', f.plan ? PLAN_LABEL[f.plan] : 'chosen at possession'],
            ['Status', statusTag(f)], ...(f.note ? [['Note', f.note] as [string, React.ReactNode]] : []),
            ...(f.def?.editedBy ? [['Last changed', `${f.def.editedBy} · ${f.def.editedD ? fd(f.def.editedD) : ''}`] as [string, React.ReactNode]] : f.def && !f.customers.length ? [['Added', `${f.def.by} · ${fd(f.def.d)}`] as [string, React.ReactNode]] : [])])}
        </div>
        <div className="card"><h3 data-hic="key" data-tone="green">{o ? 'Possessed by' : w ? 'Booked' : 'Available'}</h3>
          {o ? kv([['Customer ID', <span className="num" key="i">{custId(o)}</span>], ['Customer', <Go key="n" href={`/customers/${pid}/${o.id}`} className="link-btn">{o.name}</Go>], ['CNIC', o.cnic || 'not on file'], ['Possession', o.possessionKnown ? fd(o.possession) : 'not on file'], ['Phone', o.noPhone || !o.phone ? 'none' : o.phone]])
            : w ? <>{kv([['Customer', String(w.change?.name || '')], ['CNIC', String(w.change?.cnic || '—')], ['Possession date', w.change?.possession ? fd(String(w.change.possession)) : '—'], ['Asked by', `${w.byName} · ${fd(w.d)}`]])}
              <p className="cell-sub" style={{ margin: '10px 0 0' }}>Waiting for the Admin&apos;s approval. It can&apos;t be possessed by anyone else meanwhile.{admin ? <> <Go href="/approvals" className="link-btn">Open Approvals</Go></> : null}</p></>
            : <><p style={{ margin: 0 }}>Nobody has {f.apt} now{f.lastName ? `: ${f.lastName} left${f.leftOn ? ` on ${fd(f.leftOn)}` : ''}, with all charges cleared` : ': it has never been possessed'}.</p>
              <p className="cell-sub">It has no dues of its own; a new customer starts with a clean account.</p>
              <Go href={`${path}?m=possession`} className="btn primary sm"><Ic n="key" s={15} /> New possession</Go></>}
        </div>
      </div>
      <div className="card"><div className="card-row"><h3 data-hic="history" data-tone="violet">Customers of {f.apt} <small>{list.length ? `${list.length} so far, newest first` : 'none yet'}</small></h3></div>
        {list.length ? <div className="tbl-wrap"><table className="cus-tbl"><thead><tr><th>Customer ID</th><th>Customer</th><th>Possession</th><th>Left on</th><th>Status</th><th></th></tr></thead><tbody>
          {list.map(x => <tr key={x.id}><td className="num"><b>{custId(x)}</b></td><td><b>{x.name}</b>{x.cnic ? <div className="cell-sub num">CNIC {x.cnic}</div> : null}</td>
            <td>{x.possessionKnown ? fd(x.possession) : <span className="cell-sub">not on file</span>}</td><td>{x.status === 'closed' ? (x.closedOn ? fd(x.closedOn) : '—') : <span className="cell-sub">—</span>}</td>
            <td>{x.status === 'active' ? <span className="tag good">Active customer</span> : <span className="tag">Past customer</span>}</td>
            <td className="r"><Go href={`/customers/${pid}/${x.id}`} className="btn sm">Details &amp; history</Go></td></tr>)}
        </tbody></table></div> : <p className="empty">Nobody has had {f.apt} yet.</p>}
        <p className="cell-sub" style={{ margin: '10px 0 0' }}>Each customer has their own dues, payments and history. A customer leaves only once their charges are cleared; the apartment is then available again.</p>
      </div>
      {edit}
    </>;
  });
}
