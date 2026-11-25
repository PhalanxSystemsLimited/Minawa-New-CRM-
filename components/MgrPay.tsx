'use client';
// The building manager's Add payment fields (25 Nov 2026): the amount, Cash or Bank transfer (as two big buttons),
// the receipt book number for cash, or the transaction ID and the photo of the transfer for a bank transfer, and
// what it is for (Maintenance or Electricity, where the customer has electricity bills), and the months it pays for
// (26 Nov 2026: suggested from the unpaid bills; shown on the receipt and its WhatsApp message). Checked again on the server.
import { useState } from 'react';
import { PhotoField } from './PhotoField';
import { AmountGuard } from './AmountGuard';

export function MgrPayFields({ pid, oid, who, owed, cap, def, today, method: m0, elec, photos, months, periods }: {
  pid: string; oid: string; who: string; owed: number; cap: number; def: number; today: string; method: 'cash' | 'bank'; elec: boolean; photos: boolean;
  /** 26 Nov 2026: the months to choose from ('YYYY-MM' and its name), and the suggestion for each kind of payment. */
  months: [string, string][]; periods: { maintenance: [string, string]; electricity: [string, string] };
}) {
  const [method, setMethod] = useState<'cash' | 'bank'>(m0), [what, setWhat] = useState<'maintenance' | 'electricity'>('maintenance');
  const [from, setFrom] = useState(periods.maintenance[0]), [to, setTo] = useState(periods.maintenance[1]), [touched, setTouched] = useState(false);
  const pick = (w: 'maintenance' | 'electricity') => { setWhat(w); if (!touched) { setFrom(periods[w][0]); setTo(periods[w][1]); } };
  const n = months.findIndex(m => m[0] === to) - months.findIndex(m => m[0] === from) + 1;
  const bank = method === 'bank';
  return <>
    <div className="form-row"><label htmlFor="mp-amt">Amount received (Rs)</label>
      <input id="mp-amt" name="amt" type="number" inputMode="numeric" min={1} step={1} required defaultValue={def || ''} className="mgr-amt" autoFocus /></div>
    <AmountGuard owed={owed} cap={cap} who={who} />
    <input type="hidden" name="method" value={bank ? 'Bank transfer' : 'Cash'} />
    <div className="mgr-lab" id="mp-how">How</div>
    <div className="mgr-seg" role="radiogroup" aria-labelledby="mp-how">
      <button type="button" role="radio" aria-checked={!bank} className={!bank ? 'on' : ''} onClick={() => setMethod('cash')}>Cash</button>
      <button type="button" role="radio" aria-checked={bank} className={bank ? 'on' : ''} onClick={() => setMethod('bank')}>Bank transfer</button>
    </div>
    {bank ? <>
      <div className="form-row"><label htmlFor="mp-txn">Bank transaction ID</label><input id="mp-txn" name="txn" type="text" maxLength={80} required placeholder="e.g. FT2611180042" /></div>
      {photos ? <PhotoField key={`ph-${oid}`} pid={pid} owner={oid} label="Photo of the bank transfer" hint="The transfer on the customer's phone screen, or the bank slip." required />
        : <div className="callout"><div>Photos aren&apos;t set up yet, so no photo is needed for now.</div></div>}
    </> : <div className="form-row"><label htmlFor="mp-ref">Receipt book number</label><input id="mp-ref" name="ref" type="text" required placeholder="e.g. 1042" inputMode="text" /></div>}
    {elec ? <>
      <input type="hidden" name="forWhat" value={what} />
      <div className="mgr-lab" id="mp-for">For</div>
      <div className="mgr-seg" role="radiogroup" aria-labelledby="mp-for">
        <button type="button" role="radio" aria-checked={what === 'maintenance'} className={what === 'maintenance' ? 'on' : ''} onClick={() => pick('maintenance')}>Maintenance</button>
        <button type="button" role="radio" aria-checked={what === 'electricity'} className={what === 'electricity' ? 'on' : ''} onClick={() => pick('electricity')}>Electricity</button>
      </div>
    </> : null}
    <div className="mgr-lab" id="mp-per">Paid for (months)</div>
    <div className="mgr-period" role="group" aria-labelledby="mp-per">
      <label><span>From</span><select name="periodFrom" value={from} required onChange={e => { setTouched(true); setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}>
        {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><span>To</span><select name="periodTo" value={to} required onChange={e => { setTouched(true); setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value); }}>
        {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
    <p className="mgr-hint">{n > 1 ? `${n} months` : '1 month'} · shown on the customer&apos;s receipt and WhatsApp message.</p>
    <input type="hidden" name="paidOn" value={today} />
  </>;
}
