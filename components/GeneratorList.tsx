'use client';
// Tick flats and add them to the Generator Charges List or take them off. Filters: on/off the list, block, search.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setGeneratorAction } from '@/lib/actions-generator';

export interface GenRow { id: string; apt: string; block: string; name: string; on: boolean; fee: number; feeTxt: string; altTxt: string; own: string | null; hold: boolean; from: string; bal: string; wait: 'on' | 'off' | null }
type Show = 'all' | 'on' | 'off';

export function GeneratorList({ pid, rows, blocks, genFee, baseFee, admin = true }: { pid: string; rows: GenRow[]; blocks: string[]; genFee: string; baseFee: string; admin?: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState<Show>('all'), [block, setBlock] = useState(''), [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set()), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const list = useMemo(() => rows.filter(r => (show === 'all' || (show === 'on') === r.on) && (!block || r.block === block)
    && (!q || `${r.apt} ${r.name}`.toLowerCase().includes(q.toLowerCase()))), [rows, show, block, q]);
  const chosen = rows.filter(r => picked.has(r.id)), addN = chosen.filter(r => !r.on).length, remN = chosen.filter(r => r.on).length;
  const allTicked = list.length > 0 && list.every(r => picked.has(r.id));
  const toggleAll = () => setPicked(p => { const n = new Set(p); for (const r of list) allTicked ? n.delete(r.id) : n.add(r.id); return n; });
  const tick = (id: string, v: boolean) => setPicked(p => { const n = new Set(p); v ? n.add(id) : n.delete(id); return n; });
  const apply = (on: boolean) => {
    const ids = chosen.filter(r => r.on !== on).map(r => r.id);
    if (!ids.length) return;
    setMsg(null);
    start(async () => {
      const r = await setGeneratorAction({ pid, ids, on });
      if (r.ok) {
        const fl = (n: number) => `${n} flat${n === 1 ? '' : 's'}`;
        setMsg({ ok: true, text: r.requested ? `${fl(r.requested)} sent to an admin for approval (${on ? `add to the list, ${genFee} a month` : `take off the list, ${baseFee} a month`}). The change applies once approved, from each flat's next bill.`
          : `${fl(r.changed)} ${on ? `added to the list (${genFee} a month)` : `taken off the list (${baseFee} a month)`}, from each flat's next bill.` });
        setPicked(new Set()); router.refresh(); }
      else setMsg({ ok: false, text: r.error || 'Not saved. Try again.' });
    });
  };
  const count = (s: Show) => rows.filter(r => s === 'all' || (s === 'on') === r.on).length;

  return <div className="card">
    <div className="toolbar" style={{ marginBottom: 12 }}>
      <input className="search" type="search" placeholder="Find apartment or owner" value={q} onChange={e => setQ(e.target.value)} aria-label="Find apartment or owner" />
      {([['all', 'All flats'], ['on', 'With generator'], ['off', 'Without generator']] as [Show, string][]).map(([k, l]) =>
        <button type="button" key={k} className="chipbtn" aria-pressed={show === k} onClick={() => setShow(k)}>{l} <span className="n">{count(k)}</span></button>)}
      {blocks.length > 1 ? <select className="sc-block" aria-label="Block" value={block} onChange={e => setBlock(e.target.value)}><option value="">All blocks</option>{blocks.map(b => <option key={b} value={b}>Block {b}</option>)}</select> : null}
    </div>
    {msg ? <div className={`callout ${msg.ok ? 'good' : 'bad'}`} style={{ marginBottom: 12 }}><div>{msg.text}</div></div> : null}
    <div className="tbl-wrap"><table className="gen-table"><thead><tr>
      <th style={{ width: 34 }}><input type="checkbox" aria-label="Tick all shown" checked={allTicked} onChange={toggleAll} disabled={!list.length} /></th>
      <th>Apartment</th><th>Generator</th><th className="r">Monthly fee</th><th>From</th><th className="r">Owes now</th></tr></thead>
      <tbody>{list.length ? list.map(r => <tr key={r.id} className={picked.has(r.id) ? 'sel' : ''} onClick={e => { if ((e.target as HTMLElement).closest('a,input')) return; tick(r.id, !picked.has(r.id)); }}>
        <td><input type="checkbox" aria-label={`Tick ${r.apt}`} checked={picked.has(r.id)} onChange={e => tick(r.id, e.target.checked)} /></td>
        <td><a className="apt-a" href={`/p/${pid}/apartments/${r.id}`}>{r.apt}</a><div className="cell-sub">{r.name}</div></td>
        <td>{r.on ? <span className="tag good">With generator</span> : <span className="tag">No generator</span>}{r.hold ? <> <span className="tag warn">On hold</span></> : null}{r.wait ? <> <span className="tag warn" title="An admin has to approve or reject it">{r.wait === 'on' ? 'Add' : 'Remove'}: waiting for approval</span></> : null}</td>
        <td className="r num"><b>{r.hold ? '—' : r.feeTxt}</b>{r.own ? <div className="cell-sub">own agreed rate</div> : null}</td>
        <td className="cell-sub">{r.hold ? 'Not billed' : `${r.from} bill`}</td>
        <td className="r num">{r.bal || <span className="muted">Nothing</span>}</td></tr>)
        : <tr><td colSpan={6} className="empty">No flats match.</td></tr>}</tbody></table></div>
    <div className="gen-bar">
      <span className="muted">{chosen.length ? `${chosen.length} ticked` : 'Tick flats to change them'}{admin ? '' : ' · changes need an admin\'s approval'}{chosen.some(r => r.own) ? ' · flats with their own agreed rate keep it' : ''}</span>
      <button type="button" className="btn" disabled={busy || !remN} onClick={() => apply(false)}>{admin ? 'Remove from list' : 'Ask to remove'}{remN ? ` (${remN})` : ''}</button>
      <button type="button" className="btn primary" disabled={busy || !addN} onClick={() => apply(true)}>{busy ? 'Saving…' : `${admin ? 'Add to generator list' : 'Ask to add'}${addN ? ` (${addN})` : ''}`}</button>
    </div>
  </div>;
}
