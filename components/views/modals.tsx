// Modals, opened from the address (?m=… or ?doc=kind:id) so every one can be linked to and closed with Back.
// Plain functions, called inside use(state, …).
import type { Owner } from '@/lib/types';
import { cur, ownerById, balance, duesBreakdown, billsOf, unpaid, getTarget, tgLists, isAdmin, apartments, aptOrder, feePct, sortedPayments, periodLabel, rateTypes, baseTypes, rateFor, nextBillDate, cardRate, billDateOf, nextPeriodFor } from '@/lib/engine';
import { PLAN_LABEL, NEW_PLANS } from '@/lib/types';
import { FixNumberForm } from '@/components/ResendChat';
import { toggleGeneratorAction } from '@/lib/actions-generator';
import { possessionAction, adjustAction, instalmentAction, dueAction, discontinueAction } from '@/lib/actions-desk';
import { flatList, emptyFlats, nextCustId, custId } from '@/lib/people';
import { FlatPicker } from '@/components/FlatPicker';
import { PersonFields, IdBox } from '@/components/PersonFields';
import { reverseAction, cancelCashAction } from '@/lib/actions-cash';
import { bankOf } from '@/lib/bank';
import { billDoc, receiptDoc, statementDoc, clearanceDoc, type DocData } from '@/lib/docdata';
import { addDays, fd, fm, rs, MONL, first, ord } from '@/lib/fmt';
import { SERVICES } from '@/lib/defaults';
import { ModalShell, CloseBtn, Submit, CopyOpen, PrintBtn, Go, ActionCheck } from '../client';
import { Ic, Wa } from '../icons';
import * as act from '@/lib/actions';
import { intl } from '@/lib/dispatch';
import { waTestNumber } from '@/lib/whatsapp';
import { PhotoField } from '../PhotoField';
import { AmountGuard } from '../AmountGuard';
import { payLimits } from '@/lib/engine';
/** The amount checks under an amount field (21 Nov 2026). */
const guard = (o: Owner) => { const l = payLimits(o); return <AmountGuard owed={l.owed} cap={l.cap} who={o.name} />; };
import { photoStore } from '@/lib/images';

/** The photo of a payment at entry (21 Nov 2026), or a note when photo storage isn't set up on live yet. */
function PayPhoto({ o, label, hint, always }: { o: Owner; label: string; hint: string; always?: boolean }) {
  if (!photoStore()) return <div className="callout"><div><b>Photos aren&apos;t set up yet.</b> Once the Admin adds the Cloudinary settings, a photo of the transfer is taken here.</div></div>;
  return <PhotoField pid={cur().project} owner={o.id} label={label} hint={hint} required={always} requiredWhen={always ? undefined : { name: 'method', value: 'Bank transfer' }} />;
}

export function DocView({ d }: { d: DocData }) {
  return (
    <div className="doc">
      <div className="dh"><div><img className="doc-logo" src="/assets/minawa-logo.png" alt="Minawa Group" /><div className="sub">{d.subtitle}</div></div><div style={{ textAlign: 'right' }}><div><b>{d.refNo}</b></div><div className="sub">{d.refSub}</div></div></div>
      {d.stamp ? <div className={'rstamp' + (d.stamp.sp ? ' sp' : '')}><span className="rs-ic" aria-hidden="true">✓</span><div className="rs-t"><b>{d.stamp.title}</b><span>{d.stamp.text}</span></div><div className="rs-amt num">{d.stamp.amount}</div></div> : null}
      {d.certificate ? <div className="stamp">{d.certificate}</div> : null}
      {(d.paras || []).map((p, i) => <div key={i}>{p}</div>)}
      {d.voucher ? <div className="vch"><div className="vch-b vch-in"><span>Payable by {d.voucher.due}</span><b className="num">{d.voucher.within}</b></div>
        <div className="vch-b"><span>After the due date</span>{d.voucher.after ? <b className="num">{d.voucher.after}</b> : null}<small>{d.voucher.afterNote}</small></div></div> : null}
      <div className="kv">{d.kv.map(([k, v]) => <div key={k}><span>{k}</span>{v}</div>)}</div>
      {d.tables.map((t, i) => <table key={i}>{t.head ? <thead><tr><th>{t.head[0]}</th><th className="r">{t.head[1]}</th></tr></thead> : null}<tbody>
        {t.rows.map((r, j) => <tr key={j} className={r.tot ? 'tot' : undefined}><td>{r.bold ? <b>{r.label}</b> : r.label}{r.sub ? <div className="sub">{r.sub}</div> : null}</td><td className="r num">{r.bold ? <b>{r.amount}</b> : r.amount}</td></tr>)}
      </tbody></table>)}
      {d.howToPay ? <div><b>How to pay</b>{d.howToPay.map((h, i) => <span key={i}><br />{h}</span>)}</div> : null}
      {d.fine ? <div className="fine">{d.fine}</div> : null}
      {d.foot ? <div className="rfoot">{d.foot}</div> : null}
      {d.org ? <div className="rfoot" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>{d.org}</div> : null}
      {(d.photos || []).map(p => <div className="doc-photo" key={p.id}><b>{p.title}</b><a href={`/api/img/${p.id}`} target="_blank" rel="noopener"><img src={`/api/img/${p.id}`} alt={p.title} /></a></div>)}
      {d.counterfoil ? <div className="vch-cf"><div className="vch-cf-h">✂ Office copy · kept by the building manager</div><div className="kv">{d.counterfoil.map(([k, v]) => <div key={k}><span>{k}</span>{v || <i className="vch-line" />}</div>)}</div></div> : null}
    </div>
  );
}

/** ?doc=bill:BL-2601 | receipt:PAY-1001 | statement:O12 | clearance:DC-2026-001 */
export function DocModal({ doc, flash }: { doc: string; flash?: string }) {
  const S = cur(), [kind, id] = doc.split(':');
  let d: DocData | null = null, extra: React.ReactNode = null, title = '';
  if (kind === 'bill') { const b = S.bills.find(x => x.id === id); if (b) { d = billDoc(b); title = d.filename; } }
  if (kind === 'statement') { const o = ownerById(id); if (o) { d = statementDoc(o); title = d.filename; } }
  if (kind === 'clearance') { const c = S.clearances.find(x => x.no === id); if (c) { d = clearanceDoc(ownerById(c.ownerId), c); title = 'Dues Clearance certificate'; } }
  if (kind === 'receipt') {
    const p = S.payments.find(x => x.id === id);
    if (p) {
      d = receiptDoc(p); title = `Receipt ${p.receipt}`;
      const o = ownerById(p.ownerId), sent = !o.invalidPhone, rest = p.balAfter > 0;
      const tail = sent ? ` The receipt goes to ${first(o.name)} on WhatsApp${rest ? `, showing the ${rs(p.balAfter)} still owed` : ''}.` : ` The receipt could not go on WhatsApp because ${o.noPhone ? 'there is no WhatsApp number on file; add it' : 'the number is not on WhatsApp; fix it'} in To do.`;
      const msg = flash === 'proof' ? <><b>Payment confirmed.</b> {rs(p.amount)} from {o.name} is recorded.{tail}</>
        : flash === 'staff' ? <><b>Payment recorded.</b> {rs(p.amount)} from {o.name}.{tail}</> : null;
      extra = msg ? <div className={`callout ${sent ? 'good' : 'warn'} rc-flash`}><div>{msg}</div></div> : null;
    }
  }
  if (!d) return <ModalShell title="Not found"><div className="callout">This document doesn&apos;t exist.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
  return (
    <ModalShell title={title} wide>
      {extra}
      <DocView d={d} />
      <div className="m-actions" style={{ marginTop: 14 }}>
        <PrintBtn><Ic n="download" s={15} /> Print</PrintBtn>
        <a className="btn" href={`/api/pdf/${S.project}/${kind}/${encodeURIComponent(id)}`} download><Ic n="download" s={15} /> Download PDF</a>
        <CloseBtn label="Done" className="btn primary" />
      </div>
    </ModalShell>
  );
}

const hidden = (o: Owner) => <><input type="hidden" name="pid" value={o.project} /><input type="hidden" name="oid" value={o.id} /></>;
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

/** "Apply to the current bill or from the next bill" on every change to what a customer is charged (Phase 2). */
export function ApplyTo({ name = 'apply' }: { name?: string }) {
  return <fieldset className="pay-via apply-to"><legend>Apply the change to</legend>
    <label className="pay-via-o"><input type="radio" name={name} value="next" defaultChecked /> <span><b>From the next bill</b><small>bills already made stay as they are</small></span></label>
    <label className="pay-via-o"><input type="radio" name={name} value="current" /> <span><b>The current bill too</b><small>a correction line is added to it</small></span></label>
  </fieldset>;
}
export function OwnerModal({ m, o }: { m: string; o: Owner }) {
  const S = cur(), bal = balance(o), via = m === 'recpay-bank' ? 'bank' : '';
  if (via) m = 'recpay';
  if (m.startsWith('instal')) return InstalModal({ o, n: Math.min(24, Math.max(2, +m.split('-')[1] || 3)) });
  if (m === 'discontinue') {
    const on = !o.flagged, admin = isAdmin();
    if (S.role === 'accountant') return <ModalShell title="Discontinue maintenance"><div className="callout">The building manager asks for this; the Admin approves it.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
    return <ModalShell title={on ? 'Discontinue maintenance' : 'Resume maintenance'}><form action={discontinueAction} style={col}>{hidden(o)}<input type="hidden" name="on" value={on ? '1' : '0'} />
      <div className={`callout ${on ? 'bad' : ''}`}><div>{on ? `${o.name} still owes ${rs(Math.max(0, bal))} after the late warning. Maintenance services for ${o.apt} stop once ${admin ? 'you confirm' : 'the Admin approves'}. Charges keep running and are still owed.` : `Maintenance for ${o.apt} starts again once ${admin ? 'you confirm' : 'the Admin approves'}.`}</div></div>
      <div className="form-row"><label htmlFor="dc-r">Reason{admin ? ' (optional)' : ''}</label><input id="dc-r" name="reason" type="text" required={!admin} placeholder={on ? 'e.g. No payment after the warning of 30 Dec; owner not answering' : 'e.g. Paid in full on 5 Jan'} /></div>
      <div className="m-actions"><CloseBtn /><Submit>{admin ? (on ? 'Discontinue maintenance' : 'Resume maintenance') : 'Send for approval'}</Submit></div></form></ModalShell>;
  }
  if (m.startsWith('reverse-')) {
    const p = S.payments.find(x => x.id === m.slice(8));
    if (!p || cur().role === 'manager') return <ModalShell title="Reverse a payment"><div className="callout">{p ? 'Only the Admin or the Accountant can reverse a payment.' : 'This payment is not there any more (already reversed?).'}</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
    return <ModalShell title={`Reverse payment ${p.receipt}`}><form action={reverseAction} style={col}>{hidden(o)}<input type="hidden" name="pay" value={p.id} />
      <div className="callout bad"><div>For a payment entered by mistake: {rs(p.amount)} cash on {fd(p.d)} (receipt {p.receipt}). Reversing it takes it back exactly as it was shared out, so {o.name} owes it again; it no longer counts in collections or the cash hand-over. The receipt stays on record as reversed.</div></div>
      {isAdmin() ? null : <div className="callout warn"><div>The Admin approves this first and sees your reason.</div></div>}
      <div className="form-row"><label htmlFor="rv-r">Why is this payment wrong?</label><input id="rv-r" name="reason" type="text" required placeholder="e.g. Entered twice; the owner paid once (receipt 147)" /></div>
      <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Reverse payment' : 'Send for approval'}</Submit></div></form></ModalShell>;
  }
  if (m.startsWith('elecpaid-')) {
    // Oakwood electricity (21 Nov 2026): the customer says he paid this electricity bill. The building manager enters
    // the payment with a photo of the bill receipt or the phone screen; it pays this bill first and counts at once.
    const b = S.bills.find(x => x.id === m.slice(9) && x.ownerId === o.id && !x.months);
    const left = b ? Math.max(0, b.net - b.paid) : 0, bk = bankOf(cur().proj.bank);
    if (!b || cur().role !== 'manager' || left <= 0) return <ModalShell title="Electricity bill received"><div className="callout">{!b ? 'This electricity bill isn\'t there any more.' : left <= 0 ? 'This bill is already paid.' : 'Electricity payments are entered by the building manager.'}</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
    return <ModalShell title={`Electricity bill received · ${o.apt}`}><form action={act.recordPaymentAction} style={col}>{hidden(o)}<input type="hidden" name="billId" value={b.id} /><input type="hidden" name="forWhat" value="electricity" />
      <div className="callout">{o.name}&apos;s electricity bill for <b>{fm(b.period)}</b>: {rs(b.net)}{b.paid > 0 ? `, ${rs(b.paid)} already paid` : ''}, due {fd(b.dueDate)}. Saving marks it received: it pays this bill first, the balance changes at once and the receipt opens for you to send. The Accountant then confirms the money.</div>
      <fieldset className="pay-via"><legend>Paid as</legend>
        <label className="pay-via-o"><input type="radio" name="method" value="Cash" defaultChecked /> <span><b>Cash</b><small>given to you by hand</small></span></label>
        <label className="pay-via-o"><input type="radio" name="method" value="Bank transfer" /> <span><b>Bank transfer</b><small>{bk ? `into ${bk.bank} A/C ${bk.account}` : 'into Minawa\'s account'}</small></span></label>
      </fieldset>
      <div className="grid2" style={{ gap: 10 }}>
        <div className="form-row"><label htmlFor="ep-amt">Amount (Rs)</label><input id="ep-amt" name="amt" type="number" min="1" step="1" required defaultValue={left} /></div>
        <div className="form-row"><label htmlFor="ep-d">Paid on</label><input id="ep-d" name="paidOn" type="date" required defaultValue={cur().today} max={cur().today} /></div>
      </div>
      {guard(o)}
      <div className="form-row"><label htmlFor="ep-ref">Receipt number you gave (needed for cash)</label><input id="ep-ref" name="ref" type="text" placeholder="e.g. Book 3, No. 147" /></div>
      <div className="form-row"><label htmlFor="ep-txn">Bank transaction ID (needed for a bank transfer)</label><input id="ep-txn" name="txn" type="text" maxLength={80} placeholder="e.g. FT2611180042" /></div>
      {PayPhoto({ o, always: true, label: 'Photo of the payment', hint: 'The bill receipt, or the customer\'s phone screen showing the payment. Take it with the camera or choose it from the phone; it is shrunk before saving.' })}
      <div className="form-row"><label htmlFor="ep-n">Note (optional)</label><input id="ep-n" name="note" type="text" placeholder="e.g. Showed the bank app at the office" /></div>
      <div className="m-actions"><CloseBtn /><Submit>Mark bill received</Submit></div></form></ModalShell>;
  }
  if (m.startsWith('cancelcash-')) {
    const pr = S.proofs.find(x => x.id === m.slice(11) && x.status === 'pending');
    if (!pr || cur().role !== 'manager' || pr.byId !== S.staffId) return <ModalShell title="Cancel a payment entry"><div className="callout">This entry can&apos;t be cancelled (already confirmed, or not yours).</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
    const pay = pr.payId ? S.payments.find(x => x.id === pr.payId && !x.reversed) : undefined, sent = !!pay && S.messages.some(x => x.kind === 'receipt' && x.pdf?.id === pay.id && x.status !== 'pending' && x.status !== 'skipped');
    return <ModalShell title="Cancel a payment entry"><form action={cancelCashAction} style={col}>{hidden(o)}<input type="hidden" name="id" value={pr.id} />
      <div className="callout">{rs(pr.amount)} {(pr.method || 'Cash') === 'Bank transfer' ? 'bank transfer' : 'cash'} entered on {fd(pr.d)} (receipt {pr.ref || '—'}) is still waiting for the Accountant. Cancelling it takes it off the Accountant&apos;s list{pay ? <> and takes the payment back: {o.name}&apos;s balance goes back up by {rs(pay.amount)}{sent ? <>. <b>Its receipt was already sent: tell {o.name}</b></> : ' and its receipt is not sent'}</> : <>; nothing changes on {o.name}&apos;s account</>}.</div>
      <div className="form-row"><label htmlFor="cc-r">Why? (optional)</label><input id="cc-r" name="reason" type="text" placeholder="e.g. Wrong amount; entering it again" /></div>
      <div className="m-actions"><CloseBtn /><Submit>Cancel this entry</Submit></div></form></ModalShell>;
  }
  switch (m) {
    case 'due': return <ModalShell title="Due date for this owner"><form action={dueAction} style={col}>{hidden(o)}
      <div className="callout">For {o.name} only, from the next bill: each bill is due on this day of the month after the bill. {o.dueDay ? `Now: the ${ord(o.dueDay)}.` : 'Now: the project\'s due date.'}</div>
      <div className="form-row"><label htmlFor="du-d">Due on the</label><select id="du-d" name="dueDay" defaultValue={o.dueDay || 15}>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{ord(d)} of the month after the bill</option>)}</select></div>
      <div className="form-row"><label htmlFor="du-r">Reason{isAdmin() ? ' (optional)' : ''}</label><input id="du-r" name="reason" type="text" required={!isAdmin()} placeholder="e.g. Salary comes on the 20th" /></div>
      {isAdmin() ? null : <div className="callout warn"><div>The Admin approves this first and sees your reason.</div></div>}
      <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Save due date' : 'Send for approval'}</Submit></div></form></ModalShell>;
    case 'recpay': if (cur().role === 'admin') { const lm = payLimits(o); return <ModalShell title="Record a payment"><form action={act.recordPaymentAction} style={col}>{hidden(o)}<input type="hidden" name="method" value="Cash" /><input type="hidden" name="over" value="1" />
      <div className="callout">Payments are entered by the building manager or the Accountant. Only an amount above the most one entry can take ({rs(lm.cap)} for {o.name}, who owes {rs(lm.owed)}) is entered here, by you, after checking it is right.</div>
      <div className="form-row"><label htmlFor="ra-amt">Amount (Rs), above {rs(lm.cap)}</label><input id="ra-amt" name="amt" type="number" min={lm.cap + 1} step="1" required /></div>
      <div className="form-row"><label htmlFor="ra-ref">Receipt number given</label><input id="ra-ref" name="ref" type="text" required placeholder="e.g. Office book 2, No. 58" /></div>
      <div className="m-actions"><CloseBtn /><Submit>Record payment</Submit></div></form></ModalShell>; }
      if (cur().role === 'manager') { const b = bankOf(cur().proj.bank); return <ModalShell title="Enter a payment"><form action={act.recordPaymentAction} style={col}>{hidden(o)}
      <div className="callout">A payment {o.name} made to you in cash, or by bank transfer into Minawa&apos;s account. It counts at once: {o.name}&apos;s balance changes and the receipt opens for you to send on WhatsApp straight away. The Accountant then confirms he received the money. {o.name} owes {rs(Math.max(0, bal))}.</div>
      <fieldset className="pay-via"><legend>Received as</legend>
        <label className="pay-via-o"><input type="radio" name="method" value="Cash" defaultChecked={via !== 'bank'} /> <span><b>Cash</b><small>given to you by hand</small></span></label>
        <label className="pay-via-o"><input type="radio" name="method" value="Bank transfer" defaultChecked={via === 'bank'} /> <span><b>Bank transfer</b><small>{b ? `into ${b.bank} A/C ${b.account}` : 'into Minawa\'s account'}</small></span></label>
      </fieldset>
      {cur().settings.rules.utilities.includes('Electricity') ? <fieldset className="pay-via"><legend>Payment for</legend>
        <label className="pay-via-o"><input type="radio" name="forWhat" value="maintenance" defaultChecked /> <span><b>Maintenance</b><small>bills and earlier dues</small></span></label>
        <label className="pay-via-o"><input type="radio" name="forWhat" value="electricity" /> <span><b>Electricity</b><small>pays the electricity bills first</small></span></label>
      </fieldset> : null}
      <div className="grid2" style={{ gap: 10 }}>
        <div className="form-row"><label htmlFor="rc-amt">Amount (Rs)</label><input id="rc-amt" name="amt" type="number" min="1" step="1" required defaultValue={Math.max(0, bal) || ''} /></div>
        <div className="form-row"><label htmlFor="rc-d">Paid on</label><input id="rc-d" name="paidOn" type="date" required defaultValue={cur().today} max={cur().today} /></div>
      </div>
      {guard(o)}
      <div className="form-row"><label htmlFor="rc-ref">Receipt number you gave {via === 'bank' ? '(optional for a bank transfer)' : '(needed for cash)'}</label><input id="rc-ref" name="ref" type="text" placeholder="e.g. Book 3, No. 147" /></div>
      <div className="form-row"><label htmlFor="rc-txn">Bank transaction ID (needed for a bank transfer)</label><input id="rc-txn" name="txn" type="text" maxLength={80} placeholder="e.g. FT2611180042 or the IBFT reference" /></div>
      {PayPhoto({ o, label: 'Photo of the bank transfer', hint: 'Take a photo of the transfer on the customer\'s phone screen (or of the bank slip). It is shrunk before saving; the Accountant and the Admin open it with the payment.' })}
      <div className="form-row"><label htmlFor="rc-n">Note (optional)</label><input id="rc-n" name="note" type="text" placeholder="e.g. Paid at the site office" /></div>
      <div className="m-actions"><CloseBtn /><Submit>Save and send the receipt</Submit></div></form></ModalShell>; }
      return <ModalShell title="Record a cash payment"><form action={act.recordPaymentAction} style={col}>{hidden(o)}
      <div className="callout">Cash {o.name} paid at the office. It counts straight away and the receipt is made for the building manager to send. {o.name} owes {rs(Math.max(0, bal))}.</div>
      <div className="form-row"><label htmlFor="rp-amt">Amount (Rs)</label><input id="rp-amt" name="amt" type="number" min="1" step="1" required defaultValue={Math.max(0, bal) || ''} /></div>
      {guard(o)}
      <input type="hidden" name="method" value="Cash" />
      <div className="form-row"><label htmlFor="rp-ref">Receipt number given</label><input id="rp-ref" name="ref" type="text" placeholder="e.g. Office book 2, No. 58" required /></div>
      <div className="m-actions"><CloseBtn /><Submit>Record cash payment</Submit></div></form></ModalShell>;
    case 'promise': return <ModalShell title="Promise to pay"><form action={act.promiseAction} style={col}>{hidden(o)}
      <div className="form-row"><label htmlFor="pp-d">Owner promised to pay by</label><input id="pp-d" name="d" type="date" required min={addDays(S.today, 1)} max={addDays(S.today, 60)} defaultValue={addDays(S.today, 7)} /></div>
      <div className="form-row"><label htmlFor="pp-n">What they said</label><input id="pp-n" name="note" type="text" placeholder="e.g. Salary comes on the 10th" /></div>
      <div className="callout warn">Notices and the disconnection flag pause until this date. If it passes unpaid, you get an alert and notices resume.</div>
      <div className="m-actions"><CloseBtn /><Submit>Save promise</Submit></div></form></ModalShell>;
    case 'note': return <ModalShell title="Add note"><form action={act.noteAction} style={col}>{hidden(o)}<div className="form-row"><label htmlFor="nt">Note</label><textarea id="nt" name="text" required placeholder="e.g. Says he paid at the bank on Monday. Asked for the slip."></textarea></div><div className="m-actions"><CloseBtn /><Submit>Save note</Submit></div></form></ModalShell>;
    case 'discount': { const x = o.discount || { kind: 'pct', value: 0, until: '' };
      return <ModalShell title="Discount"><form action={act.discountAction} style={col}>{hidden(o)}
        <div className="form-row"><label htmlFor="dc-k">Type</label><select id="dc-k" name="kind" defaultValue={x.kind}><option value="pct">Percentage of the monthly fee</option><option value="fixed">Fixed amount off each bill</option><option value="none">No discount</option></select></div>
        <div className="form-row"><label htmlFor="dc-v">Value (% or Rs)</label><input id="dc-v" name="value" type="number" min="0" step="1" defaultValue={x.value || ''} /></div>
        <div className="form-row"><label htmlFor="dc-u">Ends on (optional)</label><input id="dc-u" name="until" type="date" defaultValue={x.until || ''} /></div>
        {isAdmin() ? null : <div className="form-row"><label htmlFor="dc-w">Reason for the admin <span className="req">(required)</span></label><input id="dc-w" name="why" type="text" required placeholder="e.g. Agreed with the owner for paying the year in advance" /></div>}
        {isAdmin() ? <div className="callout">Applies to bills from the next billing day. Recorded with your name.</div>
          : <div className="callout warn"><div>An admin has to approve this first. Once approved, it applies to bills from the next billing day.</div></div>}
        <ApplyTo />
        <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Save discount' : 'Send for approval'}</Submit></div></form></ModalShell>; }
    case 'clearance': {
      if (bal > 0) {
        const items: string[] = [];
        if (o.openingLeft > 0) items.push(`Opening balance: ${rs(o.openingLeft)}`);
        billsOf(o).forEach(b => { if (unpaid(b) > 0) items.push(`${periodLabel(b)}: ${rs(unpaid(b))}`); });
        if (o.feeDue > 0) items.push(`Fine (${feePct()}% of dues): ${rs(o.feeDue)}`);
        return <ModalShell title="Dues clearance check"><div className="callout bad"><div><b>Not cleared.</b> {rs(bal)} is outstanding, so a transfer NOC can&apos;t be issued yet.</div></div><ul className="rules">{items.map(i => <li key={i}>{i}</li>)}</ul><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
      }
      return <ModalShell title="Dues clearance certificate"><form action={act.clearanceAction} style={col}>{hidden(o)}<div className="callout good">No dues outstanding. Issue the Dues Clearance certificate for the transfer NOC?</div><div className="m-actions"><CloseBtn /><Submit>Issue certificate</Submit></div></form></ModalShell>;
    }
    case 'transfer':
      if (!isAdmin()) return <ModalShell title="Transfer flat"><div className="callout">Only admins (the CEO and directors) can transfer a flat.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
      if (bal > 0) return <ModalShell title="Transfer flat"><div className="callout bad">{rs(bal)} is outstanding. The seller has to clear all dues before the transfer NOC. Record the payment first.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
      return <ModalShell title="Transfer flat"><form action={act.transferAction} style={col}>{hidden(o)}
        <div className="callout good">Dues cleared. {o.name} becomes a past customer (with all their history) and the buyer is a new customer with their own account, billed from the transfer date.</div>
        <h4 className="form-h">The buyer</h4>
        <IdBox label="Buyer's customer ID" value={nextCustId()} note="Given to the buyer when you save." />
        <PersonFields prefix="tr" today={S.today} phoneLabel="Buyer's WhatsApp number" />
        <div className="grid2" style={{ gap: 10 }}>
          <div className="form-row"><label htmlFor="tr-d">Transfer and possession date</label><input id="tr-d" name="d" type="date" required defaultValue={S.today} min={addDays(S.today, -90)} max={S.today} /></div>
          <div className="form-row"><label htmlFor="tr-mr">Meter reading now <span className="req"> required</span></label><input id="tr-mr" name="reading" type="number" min="0" step="1" required inputMode="numeric" placeholder="e.g. 12450" /></div>
        </div>
        <div className="m-actions"><CloseBtn /><Submit>Transfer and open buyer account</Submit></div></form></ModalShell>;
    case 'disconnect': return <ModalShell title="Record disconnection"><form action={act.disconnectAction} style={col}>{hidden(o)}<div className="form-row"><label htmlFor="ds">Service disconnected</label><select id="ds" name="service">{SERVICES.map(s => <option key={s}>{s}</option>)}</select></div><div className="callout">Recorded against {o.apt} with today&apos;s date. Restoration is recorded once dues are paid.</div><div className="m-actions"><CloseBtn /><Submit className="btn danger">Record disconnection</Submit></div></form></ModalShell>;
    case 'fix': return <ModalShell title={o.noPhone ? 'Add WhatsApp number' : 'Fix WhatsApp number'}><FixNumberForm pid={o.project} oid={o.id} name={o.name} phone={o.phone} noPhone={o.noPhone} owes={bal > 0} /></ModalShell>;
    case 'edit': return <ModalShell title={`Edit apartment ${o.apt}`}><form action={act.editOwnerAction} style={col}>{hidden(o)}
      <IdBox label="Customer ID" value={custId(o)} />
      <PersonFields prefix="eo" today={cur().today} required={false} nameLabel="Full name (as on the CNIC)" phoneLabel="WhatsApp number" values={{ name: o.name, cnic: o.cnic, cnicExpiry: o.cnicExpiry, cnicAddress: o.cnicAddress, phone: o.phone }} />
      <div className="form-row"><label htmlFor="eo-e">Email</label><input id="eo-e" name="email" type="email" defaultValue={o.email} /></div>
      <div className="form-row"><label htmlFor="eo-ps">Possession date (billing day)</label><input id="eo-ps" name="possession" type="date" required defaultValue={o.possessionKnown ? o.possession : ''} /></div>
      <div className="form-row"><label htmlFor="eo-pl">Billing plan (owner&apos;s choice)</label><select id="eo-pl" name="plan" defaultValue={o.plan || 'monthly'}>{Object.entries(PLAN_LABEL).filter(([k]) => k !== 'quarterly' || o.plan === 'quarterly').map(([k, l]) => <option key={k} value={k}>{l}{k === 'quarterly' ? ' (every 3 months, kept for this customer)' : k === 'sixmonthly' ? ' (due every 6 months on the possession day)' : k === 'annual' ? ' (due once a year on the possession day)' : ' (due every month on the possession day)'}</option>)}</select></div>
      <div className="form-row"><label htmlFor="eo-r">Own monthly fee (Rs)</label><input id="eo-r" name="ownRate" type="number" min="0" step="1" defaultValue={o.rate || ''} placeholder={`Empty: rate card, ${rs(cardRate(o, billDateOf(nextPeriodFor(o))))} a month`} /><div className="cell-sub">Only for a flat with its own agreed fee. Counts from the {fm(nextPeriodFor(o))} bill.</div></div>
      <ApplyTo />
      {isAdmin() ? null : <><div className="callout warn"><div>A change to the possession date, the billing plan or the monthly fee needs an admin&apos;s approval. The other details save straight away.</div></div>
        <div className="form-row"><label htmlFor="eo-w">Reason for the admin <span className="req">(required if you change the possession date, plan or fee)</span></label><input id="eo-w" name="why" type="text" placeholder="e.g. Owner asked to pay quarterly" /></div></>}
      <div className="form-row"><label htmlFor="eo-ab"><input id="eo-ab" name="abroad" type="checkbox" defaultChecked={o.abroad} /> Owner lives abroad</label></div>
      {isAdmin() ? <div className="form-row"><label htmlFor="eo-x"><input id="eo-x" name="exempt" type="checkbox" defaultChecked={o.exempt} /> Exempt from billing (directors&apos; flats)</label></div> : null}
      <div className="m-actions"><CloseBtn /><Submit>Save</Submit></div></form></ModalShell>;
    case 'adjust': return <ModalShell title="Adjustment"><form action={adjustAction} style={col}>{hidden(o)}
      <div className="form-row"><label htmlFor="aj-k">Type</label><select id="aj-k" name="kind" defaultValue="charge"><option value="charge">Charge: add to the next bill (repairs, adjustment cost, correction)</option><option value="credit">Credit or waiver: lower what {o.name} owes now</option></select></div>
      <div className="form-row"><label htmlFor="aj-a">Amount (Rs)</label><input id="aj-a" name="amount" type="number" min="1" step="1" required /></div>
      <div className="form-row"><label htmlFor="aj-r">Reason</label><input id="aj-r" name="reason" type="text" required placeholder="e.g. Water tank repair share; agreed waiver of September fine" /></div>
      {isAdmin() ? <div className="callout">Shows in the apartment&apos;s history with your name and the reason.</div>
        : <div className="callout warn"><div>An admin has to approve this first, and sees your reason. Once approved, it shows in the apartment&apos;s history with your name and the reason.</div></div>}
      <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Save adjustment' : 'Send for approval'}</Submit></div></form></ModalShell>;
    case 'generator': { if (cur().role !== 'manager') return <ModalShell title="Generator charges"><div className="callout">The generator charges list is kept by the building manager.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
      const on = !o.generator;
      return <ModalShell title={on ? 'Add generator charges' : 'Remove generator charges'}><form action={toggleGeneratorAction} style={col}>{hidden(o)}<input type="hidden" name="on" value={on ? '1' : '0'} />
        <div className="callout">{on ? `${o.apt} goes on the Generator Charges List` : `${o.apt} comes off the Generator Charges List`}.</div>
        <ApplyTo />
        {isAdmin() ? null : <><div className="form-row"><label htmlFor="gn-w">Reason for the admin <span className="req">(required)</span></label><input id="gn-w" name="why" type="text" required placeholder="e.g. Generator connection installed on 10 Nov" /></div>
          <div className="callout warn"><div>An admin has to approve this first.</div></div></>}
        <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? (on ? 'Add generator charges' : 'Remove generator charges') : 'Send for approval'}</Submit></div></form></ModalShell>; }
    case 'send': return cur().role === 'manager' ? SendModal({ o }) : <ModalShell title="Send on WhatsApp"><div className="callout">Sending on WhatsApp is the building manager&apos;s work.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
    default: return null;
  }
}

/** Send an owner their dues on WhatsApp, by hand: Send on WhatsApp opens the owner's chat with the message typed in. */
function SendModal({ o }: { o: Owner }) {
  const bal = balance(o);
  if (bal <= 0) return <ModalShell title="Send dues on WhatsApp"><div className="callout">Nothing owed, so there is nothing to send.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
  return <ModalShell title="Send dues on WhatsApp" wide>
    <div className="wa-to"><span className="wa-logo"><Wa /></span><div style={{ minWidth: 0 }}><div className="cell-sub">To</div><b className="num">{o.phone || 'No WhatsApp number'}</b>
      <div className="cell-sub">Apartment {o.apt}, owner {o.name}.{waTestNumber() ? ` Testing mode: the chat opens with the test number +${waTestNumber()} instead.` : ''}</div></div></div>
    <div className="wa-att"><span className="pdf-ic" aria-hidden="true">PDF</span><div className="t"><b>Statement-{o.apt}-{cur().today}.pdf</b><span className="cell-sub">Optional: attach it in the chat</span></div>
      <a className="btn sm" href={`/api/pdf/${o.project}/statement/${o.id}`} download><Ic n="download" s={14} /> Download</a></div>
    <details className="wa-prev"><summary>Preview the PDF</summary><div><DocView d={statementDoc(o)} /></div></details>
    <h4 className="tg-h4">Send it</h4>
    <div className="wa-ways">
      <div className="wa-way"><div className="t"><b>Send by hand on WhatsApp Web</b><span className="cell-sub">Writes {o.name}&apos;s dues of {rs(bal)} and how to pay, opens their chat with the message typed in, and records it on the history once you&apos;ve sent it.</span></div>
        <Go href={`/p/${o.project}/send?type=link&ids=${o.id}&go=1`} className="btn wa"><Wa /> Open in WhatsApp</Go></div>
    </div>
    <div className="m-actions" style={{ marginTop: 14 }}><CloseBtn /></div>
  </ModalShell>;
}

/** Quick action: pick an apartment to send their dues to. */
export function SendPickModal() {
  const list = apartments().filter(x => x.status === 'active' && !x.exempt && balance(x) > 0).sort(aptOrder);
  return <ModalShell title="Send dues on WhatsApp"><form action={act.pickAction} style={col}><input type="hidden" name="pid" value={cur().project} />
    {list.length ? <div className="form-row"><label htmlFor="sl-o">Apartment</label><select id="sl-o" name="oid">{list.map(x => <option key={x.id} value={x.id}>{x.apt} · {x.name} · {rs(balance(x))}</option>)}</select></div> : <div className="callout">Nobody owes anything right now.</div>}
    <div className="m-actions"><CloseBtn />{list.length ? <Submit className="btn wa"><Wa /> Next</Submit> : null}</div></form></ModalShell>;
}

/** How the month's target is made up (the demo's targetModal). */
export function TargetModal() {
  const S = cur(), p = S.today.slice(0, 7), t = getTarget(p), monName = MONL[+p.slice(5) - 1];
  const coll = S.payments.filter(x => x.d.slice(0, 7) === p).reduce((s, x) => s + x.amount, 0), pct = t.total ? Math.round(100 * coll / t.total) : 0;
  return <ModalShell title={`${fm(p)} target`} wide>
    <p className="muted" style={{ margin: '0 0 12px' }}>Set on 1 {monName}: what every billed flat owes for the month at the rate card. Old arrears and late fees come on top, so collections can go past it.</p>
    <div className="tbl-wrap"><table className="tg-tbl"><thead><tr><th>Flat type</th><th className="r">Flats</th><th className="r">Monthly rate</th><th className="r">Subtotal</th></tr></thead><tbody>
      {t.types.map(x => <tr key={x.type}><td className="cell-main">{x.type}</td><td className="r num">{x.n}</td><td className="r num">{rs(x.rate)}</td><td className="r num">{rs(x.sub)}</td></tr>)}
      <tr><td><b>At the rate card</b></td><td className="r num"><b>{t.flats}</b></td><td></td><td className="r num"><b>{rs(t.gross)}</b></td></tr>
      {t.own ? <tr><td>Flats charged their own rate<div className="cell-sub">{t.ownN} flat{t.ownN === 1 ? '' : 's'} off the rate card</div></td><td></td><td></td><td className="r num">{t.own < 0 ? '−' + rs(-t.own) : rs(t.own)}</td></tr> : null}
      {t.disc ? <tr><td>Agreed discounts taken off<div className="cell-sub">{t.discN} flat{t.discN === 1 ? '' : 's'}</div></td><td></td><td></td><td className="r num">−{rs(t.disc)}</td></tr> : null}
      {t.discOnN ? <tr><td>Discounted flats at the full rate<div className="cell-sub">{t.discOnN} flat{t.discOnN === 1 ? '' : 's'}, {rs(t.discOn)} of discounts not taken off</div></td><td></td><td></td><td className="r num">Rs 0</td></tr> : null}
      {t.exOnN ? <tr><td>Exempt or on-hold flats counted<div className="cell-sub">{t.exOnN} flat{t.exOnN === 1 ? '' : 's'} at the rate card</div></td><td className="r num">{t.exOnN}</td><td></td><td className="r num">+{rs(t.exOn)}</td></tr> : null}
      <tr className="tot"><td>{monName} target</td><td className="r num">{t.flats + (t.exOnN || 0)}</td><td></td><td className="r num">{rs(t.total)}</td></tr>
    </tbody></table></div>
    {t.excluded ? <div className="callout" style={{ marginTop: 12 }}><div>{t.excluded} exempt or on-hold flat{t.excluded === 1 ? ' isn\'t' : 's aren\'t'} counted (directors&apos; flats are exempt).</div></div> : null}
    <div className={`callout ${pct >= 100 ? 'good' : ''}`} style={{ marginTop: 10 }}><div><b>{rs(coll)}</b> collected so far, {pct}% of the target. {pct >= 100 ? 'Target met.' : `${rs(t.total - coll)} still to go.`}</div></div>
    <h4 className="tg-h4">What the target counts</h4>
    {TargetOpts('m')}
    <div className="m-actions" style={{ marginTop: 14 }}><Go href={`/p/${S.project}/payments?per=month`} className="btn">View {monName} payments</Go><CloseBtn label="Close" className="btn primary" /></div>
  </ModalShell>;
}

/** The two target switches with flat-by-flat lists (the demo's targetOptsHtml). Admins only. */
export function TargetOpts(where: string) {
  const S = cur(), { disc, exempt } = tgLists(), inc = S.settings.tgInc, ad = isAdmin();
  const group = (key: 'disc' | 'exempt', list: { o: Owner; disc?: number; amt?: number }[], label: string, offText: string, onText: (n: number) => string, amt: (x: { o: Owner; disc?: number; amt?: number }) => string) => {
    const n = list.filter(x => inc[key].includes(x.o.id)).length, all = !!list.length && n === list.length;
    return <div className="tg-opt">
      <label className="tg-sw"><ActionCheck action={act.targetOptionAction} args={{ pid: S.project, key, all: '1' }} role="switch" checked={all} mixed={!!n && !all} disabled={!list.length || !ad} title={ad ? undefined : 'Admins only'} /><span className="sw" aria-hidden="true"></span>
        <span className="tg-sw-t"><b>{label}</b><span className="cell-sub">{n ? onText(n) : offText}</span></span></label>
      {list.length ? <details className="tg-pick" data-k={key + where}><summary>Choose flats · {n} of {list.length} on</summary><div className="tg-list">
        {list.map(x => <label className="tg-row" key={x.o.id}><ActionCheck action={act.targetOptionAction} args={{ pid: S.project, key, id: x.o.id }} checked={inc[key].includes(x.o.id)} disabled={!ad} /><span className="t"><b>{x.o.apt}</b> · {x.o.name}</span><span className="num muted">{amt(x)}</span></label>)}
      </div></details> : null}</div>;
  };
  const dSum = disc.reduce((s, x) => s + x.disc, 0), eSum = exempt.reduce((s, x) => s + x.amt, 0);
  return <div className="tg-opts">
    {group('disc', disc, 'Count discounted flats at the full rate', disc.length ? `Off: discounts come off the target (${disc.length} flat${disc.length === 1 ? '' : 's'}, ${rs(dSum)} this month).` : 'No flats have a discount this month.', n => `On for ${n} of ${disc.length}: their discount doesn't come off the target.`, x => `${rs(x.disc!)} off`)}
    {group('exempt', exempt, 'Count exempt and on-hold flats', exempt.length ? `Off: ${exempt.length} flat${exempt.length === 1 ? ' isn\'t' : 's aren\'t'} counted (${rs(eSum)} at the rate card).` : 'No flats are exempt or on hold.', n => `On for ${n} of ${exempt.length}: counted at the rate card.`, x => rs(x.amt!))}
    {ad ? <div className="cell-sub">Changes update this month&apos;s target now and are kept for the next months. Earlier months stay as they were set.</div> : <div className="cell-sub">Only admins (the CEO and directors) can change these.</div>}
  </div>;
}
export { sortedPayments };

/** New possession (21 Nov 2026): the customer takes an EMPTY flat picked from the building's list (a small window
 *  with a search box), with their details from the CNIC. Billing starts from the possession date. */
export function PossessionModal({ preset = '', back = '' }: { preset?: string; back?: string } = {}) {
  const S = cur(), types = baseTypes(), g = S.settings.rules.graceDays ?? 25, ex = addDays(S.today, g);
  const all = flatList(), empty = emptyFlats().map(f => ({ apt: f.apt, block: f.block, floor: f.floor, type: f.type, plan: f.plan || '', status: f.status === 'new' ? 'new' as const : 'vacant' as const,
    note: f.status === 'new' ? 'never possessed' : `${f.lastName ? `${f.lastName} left` : 'empty'}${f.leftOn ? ` on ${fd(f.leftOn)}` : ''}` }));
  const pre = empty.find(f => f.apt.toUpperCase() === preset.toUpperCase()) || null;
  const closeKeys = ['m', 'flat', 'pp'];
  return <ModalShell title={`New possession · ${S.proj.name}`} wide closeKeys={closeKeys}><form action={possessionAction} style={col}><input type="hidden" name="pid" value={S.project} />{back ? <input type="hidden" name="back" value={back} /> : null}
    <div className="callout">The customer takes an available apartment. Billing starts on the possession date: the first month is charged from that day. The first bill goes out {g} days after possession and then on that date every month, 6 months or year (possession today: first bill {fd(ex)}, due on the {ord(S.settings.rules.dueDays)} of the month after).</div>
    {isAdmin() ? null : <div className="callout warn"><div>The Admin approves the possession first. Until then the apartment shows as booked, isn&apos;t billed and gets no reminders.</div></div>}
    <h4 className="form-h">1 · The apartment</h4>
    <FlatPicker flats={empty} total={all.length} admin={isAdmin()} initial={pre} types={types.map(t => [t, `${t} · ${rs(rateFor(t, S.today))} a month`] as [string, string])} />
    <h4 className="form-h">2 · The customer</h4>
    <IdBox label="Customer ID" value={nextCustId()} note={isAdmin() ? 'Given to this customer when you save.' : 'The next free ID; confirmed when the Admin approves.'} />
    <PersonFields prefix="np" today={S.today} phoneLabel="WhatsApp number" />
    <div className="form-row"><label htmlFor="np-e">Email (optional)</label><input id="np-e" name="email" type="email" /></div>
    <h4 className="form-h">3 · Possession</h4>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor="np-d">Possession date</label><input id="np-d" name="possession" type="date" required defaultValue={S.today} /></div>
      <div className="form-row"><label htmlFor="np-pl">Billing plan (maintenance)</label><select id="np-pl" name="plan" defaultValue={pre?.plan || 'monthly'}>{NEW_PLANS.map(k => <option key={k} value={k}>{PLAN_LABEL[k]}</option>)}</select></div>
      <div className="form-row"><label htmlFor="np-mr">Meter reading now <span className="req"> required</span></label><input id="np-mr" name="reading" type="number" min="0" step="1" required inputMode="numeric" placeholder="e.g. 12450" /><div className="cell-sub">The electricity meter&apos;s current reading, on the day of possession.</div></div>
    </div>
    <div className="form-row"><label htmlFor="np-x">Note (optional)</label><input id="np-x" name="note" type="text" placeholder="e.g. Keys handed over" /></div>
    <div className="m-actions"><CloseBtn keys={closeKeys} /><Submit>{isAdmin() ? 'Record possession' : 'Send for approval'}</Submit></div></form></ModalShell>;
}

/** An instalment plan for an owner's old arrears: equal parts a month apart to start with, every amount and date
 *  editable (custom plans). The parts must add up to the old arrears exactly; the Admin approves it. */
function InstalModal({ o, n }: { o: Owner; n: number }) {
  const S = cur(), total = Math.round(o.openingLeft || 0), each = Math.floor(total / n), last = total - each * (n - 1);
  const start = addDays(S.today, 30), dateAt = (i: number) => { const d0 = new Date(Date.parse(start) + 0); d0.setUTCMonth(d0.getUTCMonth() + i); return d0.toISOString().slice(0, 10); };
  const cur0 = o.instalments, base = `/p/${S.project}/apartments/${o.id}`;
  return <ModalShell title="Instalment plan for old arrears"><form action={instalmentAction} style={col}>{hidden(o)}
    <div className="callout">{o.name} owes <b>{rs(total)}</b> in old arrears. Agree the parts with them; they must add up to {rs(total)}. Monthly bills carry on as usual and are not part of the plan.{cur0 ? ` A plan of ${cur0.items.length} parts is in place now; this replaces it once approved.` : ''}</div>
    <div className="inst-n"><span className="cell-sub">Parts:</span>{[2, 3, 4, 6, 9, 12].map(k => <Go key={k} href={`${base}?m=instal-${k}`} replace className={`chipbtn${k === n ? ' on' : ''}`}>{k}</Go>)}</div>
    <div className="inst-rows">{Array.from({ length: n }, (_, i) => <div className="grid2 inst-row" key={i} style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor={`in-a${i}`}>Part {i + 1} (Rs)</label><input id={`in-a${i}`} name="amount" type="number" min="1" step="1" required defaultValue={i === n - 1 ? last : each} /></div>
      <div className="form-row"><label htmlFor={`in-d${i}`}>Due by</label><input id={`in-d${i}`} name="due" type="date" required defaultValue={dateAt(i)} /></div>
    </div>)}</div>
    <div className="form-row"><label htmlFor="in-r">What was agreed{isAdmin() ? ' (optional)' : ''}</label><input id="in-r" name="reason" type="text" required={!isAdmin()} placeholder="e.g. Agreed on a call on 17 Nov; can pay Rs 50,000 a month" /></div>
    {isAdmin() ? null : <div className="callout warn"><div>The Admin approves, rejects or asks for changes. Until approved, the old arrears stay due in full.</div></div>}
    <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Save plan' : 'Send for approval'}</Submit></div></form></ModalShell>;
}
