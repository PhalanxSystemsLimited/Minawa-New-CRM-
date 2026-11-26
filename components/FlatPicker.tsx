'use client';
// New possession's flat (21 Nov 2026): "Choose a flat" opens a small window (not full screen) with a search box and
// the building's EMPTY flats only (nobody has them now, and no possession is waiting for them). Picking one fills the
// flat, its block and floor, and its type. A flat that's taken can't be picked here, and the server checks it again.
// 26 Nov 2026: the type comes from the apartment; choosing another type is shown, and goes to the Admin with the possession.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from './icons';

export interface PickFlat { apt: string; block: string; floor: string; type: string; plan?: string; status: 'vacant' | 'new'; note: string }

export function FlatPicker({ flats, types, total, admin, initial = null }: { flats: PickFlat[]; types: [string, string][]; total: number; admin: boolean; initial?: PickFlat | null }) {
  const [pick, setPick] = useState<PickFlat | null>(initial), [open, setOpen] = useState(false), [type, setType] = useState(initial && types.some(([v]) => v === initial.type) ? initial.type : types[0]?.[0] || '');
  const check = useRef<HTMLInputElement>(null);
  useEffect(() => { check.current?.setCustomValidity(pick ? '' : 'Choose the apartment: press "Choose an apartment" and pick an available one.'); }, [pick]);
  const choose = (f: PickFlat) => {
    setPick(f); if (types.some(([v]) => v === f.type)) setType(f.type); setOpen(false);
    // The apartment's billing plan, when the Admin set one, becomes the starting choice.
    const pl = document.getElementById('np-pl') as HTMLSelectElement | null; if (pl && f.plan && [...pl.options].some(o => o.value === f.plan)) pl.value = f.plan;
  };
  return <>
    <div className="form-row"><label>Apartment <span className="req"> required</span></label>
      <input type="hidden" name="apt" value={pick?.apt || ''} /><input type="hidden" name="block" value={pick?.block || ''} /><input type="hidden" name="floor" value={pick?.floor || ''} />
      <input ref={check} className="ph-check" tabIndex={-1} aria-hidden="true" value={pick?.apt || ''} onChange={() => undefined} required />
      <div className={'fp-field' + (pick ? ' on' : '')}>
        {pick ? <div className="fp-sel"><b>{pick.apt}</b><span className="cell-sub">{[pick.block && `Block ${pick.block}`, pick.floor, pick.type, pick.note].filter(Boolean).join(' · ')}</span></div>
          : <span className="cell-sub">{flats.length ? `${flats.length} available apartment${flats.length === 1 ? '' : 's'} to choose from` : 'No available apartments in this building'}</span>}
        <button type="button" className={'btn sm' + (pick ? '' : ' primary')} onClick={() => setOpen(true)} disabled={!flats.length}><Ic n="search" s={15} /> {pick ? 'Change' : 'Choose an apartment'}</button>
      </div>
      {!flats.length ? <div className="cell-sub">Every apartment here is possessed or booked{admin ? '. Add the building\'s other apartments on the Apartments screen.' : '. The Admin adds new apartments on the Apartments screen.'}</div> : null}
    </div>
    <div className="form-row"><label htmlFor="np-t">Type</label><select id="np-t" name="type" required value={type} onChange={e => setType(e.target.value)}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {pick && pick.type && !types.some(([v]) => v === pick.type) ? <div className="cell-sub">This flat was a {pick.type}; that type has no rate now, so pick its type.</div>
        : pick && pick.type && type !== pick.type ? <div className="cell-sub warn-t">{pick.apt} is a {pick.type}. {admin ? 'Saving changes the apartment\'s type to ' + type + '.' : 'Changing it to ' + type + ' needs the Admin\'s approval (sent with this possession).'}</div>
        : pick ? <div className="cell-sub">From the apartment&apos;s details.</div> : null}</div>
    {open ? <PickBox flats={flats} total={total} current={pick?.apt || ''} onPick={choose} onClose={() => setOpen(false)} /> : null}
  </>;
}

function PickBox({ flats, total, current, onPick, onClose }: { flats: PickFlat[]; total: number; current: string; onPick: (f: PickFlat) => void; onClose: () => void }) {
  const [q, setQ] = useState(''), [kind, setKind] = useState<'all' | 'vacant' | 'new'>('all'), box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, ' ');
    return flats.filter(f => (kind === 'all' || f.status === kind) && (!t || `${f.apt} ${f.block} ${f.floor} ${f.type} ${f.note}`.toLowerCase().includes(t)));
  }, [flats, q, kind]);
  const nV = flats.filter(f => f.status === 'vacant').length;
  return createPortal(<div className="fp-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="fp-card" role="dialog" aria-modal="true" aria-label="Choose an available apartment">
      <div className="fp-head"><div><b>Choose an available apartment</b><div className="cell-sub">{flats.length} of {total} apartments are available. Possessed or booked apartments can&apos;t be picked.</div></div><button type="button" className="icon fp-x" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="fp-search"><Ic n="search" s={16} /><input ref={box} type="search" placeholder="Search apartment, block, floor or type" value={q} onChange={e => setQ(e.target.value)} aria-label="Search apartments" /></div>
      <div className="fp-chips">
        <button type="button" className="chipbtn" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All <span className="n">{flats.length}</span></button>
        <button type="button" className="chipbtn" aria-pressed={kind === 'vacant'} onClick={() => setKind('vacant')}>Customer left <span className="n">{nV}</span></button>
        <button type="button" className="chipbtn" aria-pressed={kind === 'new'} onClick={() => setKind('new')}>Never possessed <span className="n">{flats.length - nV}</span></button>
      </div>
      <div className="fp-list" role="listbox" aria-label="Available apartments">
        {list.length ? list.map(f => <button type="button" role="option" aria-selected={f.apt === current} key={f.apt} className={'fp-item' + (f.apt === current ? ' on' : '')} onClick={() => onPick(f)}>
          <span className="fp-apt">{f.apt}</span>
          <span className="fp-meta">{[f.block && `Block ${f.block}`, f.floor, f.type].filter(Boolean).join(' · ') || '—'}<small>{f.note}</small></span>
          <span className={`tag ${f.status === 'new' ? 'info' : 'warn'}`}>{f.status === 'new' ? 'Never possessed' : 'Available'}</span>
        </button>) : <p className="empty" style={{ margin: 0 }}>No available apartment matches &quot;{q}&quot;.</p>}
      </div>
    </div>
  </div>, document.body);
}
