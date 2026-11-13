'use client';
// Pick a file, see what will be imported and every problem in it, then import.
import { useState } from 'react';
import { parseImport, type ImportResult } from '@/lib/importer';
import { importAction } from '@/lib/import-action';
import { RATE_CARDS } from '@/lib/defaults';
const nextMonthOf = (d: string) => { let y = +d.slice(0, 4), m = +d.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}-01`; };
import { Submit } from './client';

export function ImportForm({ pid, first, today, bank, existingTypes }: { pid: string; first: boolean; today: string; bank: string; existingTypes: string[] }) {
  const [res, setRes] = useState<ImportResult | null>(null), [err, setErr] = useState(''), [file, setFile] = useState('');
  const onFile = async (f: File | undefined) => {
    setErr(''); setRes(null); if (!f) return;
    setFile(f.name);
    if (/\.xlsx?$/i.test(f.name)) { setErr('Save the Excel sheet as CSV first (File › Save As › CSV), then pick the CSV. For the accountant\'s yearly sheet, run scripts/import_maintenance_xls.py and pick the JSON it makes.'); return; }
    try { setRes(parseImport(f.name, await f.text())); } catch (e) { setErr(`Couldn't read ${f.name}: ${(e as Error).message}`); }
  };
  const blocking = res?.problems.filter(p => p.line <= 1) || [];
  const types = res ? [...new Set([...res.types])] : [];
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div className="card"><h3>1 · Pick the owner list <small>CSV, or JSON from the import script</small></h3>
      <p className="muted" style={{ margin: '-4px 0 12px', fontSize: 13 }}>One row per apartment. Columns (any order): <b>Apartment</b>, <b>Block</b>, <b>Type</b>, <b>Owner</b>, <b>WhatsApp</b> (with country code), <b>Possession</b> date, <b>Opening balance</b>, and optionally Email, Own rate, Discount, Exempt.</p>
      <div className="toolbar"><input type="file" accept=".csv,.json,.txt,.xls,.xlsx" onChange={e => onFile(e.target.files?.[0])} aria-label="Owner list file" />
        <a className="btn sm" href="/owners-template.csv" download>Download a blank CSV</a></div>
      {err ? <div className="callout bad" style={{ marginTop: 12 }}><div>{err}</div></div> : null}
    </div>
    {res ? <form action={importAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="pid" value={pid} /><input type="hidden" name="rows" value={JSON.stringify(res.rows)} /><input type="hidden" name="source" value={res.source === 'CSV' ? file : res.source} />
      <div className="card"><h3>2 · Check <small>{file}</small></h3>
        <div className={`callout ${res.problems.length ? 'warn' : 'good'}`} style={{ marginBottom: 12 }}><div><b>{res.rows.length} apartments</b> found{res.problems.length ? `, ${res.problems.length} thing${res.problems.length === 1 ? '' : 's'} to look at` : ', no problems'}. {first ? 'This sets the project up.' : 'Apartments already here are updated (name, WhatsApp, possession); new ones are added.'}</div></div>
        {res.problems.length ? <details className="wa-prev" open={res.problems.length < 12}><summary>Problems ({res.problems.length})</summary><div className="tbl-wrap"><table><thead><tr><th>Row</th><th>Apartment</th><th>What</th></tr></thead><tbody>
          {res.problems.slice(0, 400).map((p, i) => <tr key={i}><td className="num">{p.line}</td><td>{p.apt}</td><td>{p.text}</td></tr>)}</tbody></table></div></details> : null}
        <details className="wa-prev"><summary>First 20 apartments</summary><div className="tbl-wrap"><table><thead><tr><th>Apartment</th><th>Type</th><th>Owner</th><th>WhatsApp</th><th>Possession</th><th className="r">Opening</th></tr></thead><tbody>
          {res.rows.slice(0, 20).map(r => <tr key={r.apt}><td className="cell-main">{r.apt}<div className="cell-sub">Block {r.block}</div></td><td>{r.type}</td><td>{r.name}{r.exempt ? <> <span className="tag">Exempt</span></> : null}</td><td className="num">{r.phone || '–'}</td><td className="num">{r.possession || '–'}</td><td className="r num">{r.opening.toLocaleString('en-US')}</td></tr>)}</tbody></table></div></details>
      </div>
      {first ? <div className="card"><h3>3 · Rate card and go-live</h3>
        <div className="tbl-wrap"><table><thead><tr><th>Apartment type</th><th className="r">Flats</th><th className="r">Monthly rate (Rs)</th></tr></thead><tbody>
          {types.map(t => <tr key={t}><td className="cell-main">{t}</td><td className="r num">{res.rows.filter(r => r.type === t).length}</td><td className="r"><input className="fee-in num" type="number" min="0" step="100" name={`rate:${t}`} required defaultValue={res.rates[t] || RATE_CARDS[pid]?.find(x => x.type === t)?.amount || ''} /></td></tr>)}
        </tbody></table></div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="form-row"><label htmlFor="gl">First month the system bills</label><input id="gl" name="goLive" type="month" required defaultValue={(res.goLive || nextMonthOf(today)).slice(0, 7)} /></div>
          <div className="form-row"><label htmlFor="bk">Bank account (title · bank · IBAN)</label><input id="bk" name="bank" defaultValue={bank} placeholder="Printed on every bill" /></div>
        </div>
        <p className="cell-sub" style={{ margin: '10px 0 0' }}>Opening balances are what each owner owes before that month: the sheet's balance (arrears, this year's charge, electricity and adjustments, less discounts and what was received). The first bill, for that month, goes out on the 25th before it. Flats whose yearly charge isn't 12 × the rate card keep their own monthly rate. If that date is already past, the missed bills are made now without sending messages.</p>
      </div> : <input type="hidden" name="types" value={existingTypes.join(',')} />}
      <div className="m-actions"><Submit disabled={!!blocking.length} pendingText="Importing…">{first ? `Set up with ${res.rows.length} apartments` : `Import ${res.rows.length} apartments`}</Submit></div>
    </form> : null}
  </div>;
}
