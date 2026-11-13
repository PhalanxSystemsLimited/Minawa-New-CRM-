// Modals, opened from the address (?m=… or ?doc=kind:id) so every one can be linked to and closed with Back.
// Plain functions, called inside use(state, …).
import type { Owner } from '@/lib/types';
import { cur, ownerById, balance, duesBreakdown, activeLink, billsOf, unpaid, getTarget, tgLists, isAdmin, apartments, aptOrder, feePct, sortedPayments, periodLabel, rateTypes, baseTypes, rateFor, nextBillDate, cardRate, billDateOf, nextPeriodFor } from '@/lib/engine';
import { PLAN_LABEL } from '@/lib/types';
import { FixNumberForm } from '@/components/ResendChat';
import { possessionAction, adjustAction } from '@/lib/actions-desk';
import { billDoc, receiptDoc, statementDoc, clearanceDoc, type DocData } from '@/lib/docdata';
import { addDays, fd, fm, rs, MONL, first, ord } from '@/lib/fmt';
import { SERVICES } from '@/lib/defaults';
import { ModalShell, CloseBtn, Submit, CopyOpen, PrintBtn, Go, ActionCheck } from '../client';
import { Ic, Wa } from '../icons';
import * as act from '@/lib/actions';
import { intl } from '@/lib/dispatch';
import { waTestNumber } from '@/lib/whatsapp';

export function DocView({ d }: { d: DocData }) {
  return (
    <div className="doc">
      <div className="dh"><div><img className="doc-logo" src="/assets/minawa-logo.png" alt="Minawa Group" /><div className="sub">{d.subtitle}</div></div><div style={{ textAlign: 'right' }}><div><b>{d.refNo}</b></div><div className="sub">{d.refSub}</div></div></div>
      {d.stamp ? <div className={'rstamp' + (d.stamp.sp ? ' sp' : '')}><span className="rs-ic" aria-hidden="true">✓</span><div className="rs-t"><b>{d.stamp.title}</b><span>{d.stamp.text}</span></div><div className="rs-amt num">{d.stamp.amount}</div></div> : null}
      {d.certificate ? <div className="stamp">{d.certificate}</div> : null}
      {(d.paras || []).map((p, i) => <div key={i}>{p}</div>)}
      <div className="kv">{d.kv.map(([k, v]) => <div key={k}><span>{k}</span>{v}</div>)}</div>
      {d.tables.map((t, i) => <table key={i}>{t.head ? <thead><tr><th>{t.head[0]}</th><th className="r">{t.head[1]}</th></tr></thead> : null}<tbody>
        {t.rows.map((r, j) => <tr key={j} className={r.tot ? 'tot' : undefined}><td>{r.bold ? <b>{r.label}</b> : r.label}{r.sub ? <div className="sub">{r.sub}</div> : null}</td><td className="r num">{r.bold ? <b>{r.amount}</b> : r.amount}</td></tr>)}
      </tbody></table>)}
      {d.howToPay ? <div><b>How to pay</b>{d.howToPay.map((h, i) => <span key={i}><br />{h}</span>)}</div> : null}
      {d.fine ? <div className="fine">{d.fine}</div> : null}
      {d.foot ? <div className="rfoot">{d.foot}</div> : null}
      {d.org ? <div className="rfoot" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>{d.org}</div> : null}
    </div>
  );
}

/** ?doc=bill:BL-2601 | receipt:PAY-1001 | statement:O12 | clearance:DC-2026-001 */
export function DocModal({ doc, flash }: { doc: string; flash?: string }) {
  const S = cur(), [kind, id] = doc.split(':');
  let d: DocData | null = null, extra: React.ReactNode = null, title = '';
  if (kind === 'bill') { const b = S.bills.find(x => x.id === id); if (b) { d = billDoc(b); title = d.filename; } }
  if (kind === 'statement') { const o = ownerById(id); if (o) { d = statementDoc(o, activeLink(o)); title = d.filename; } }
  if (kind === 'clearance') { const c = S.clearances.find(x => x.no === id); if (c) { d = clearanceDoc(ownerById(c.ownerId), c); title = 'Dues Clearance certificate'; } }
  if (kind === 'receipt') {
    const p = S.payments.find(x => x.id === id);
    if (p) {
      d = receiptDoc(p); title = `Receipt ${p.receipt}`;
      const o = ownerById(p.ownerId), sent = !o.invalidPhone, rest = p.balAfter > 0;
      const tail = sent ? ` The receipt goes to ${first(o.name)} on WhatsApp${rest ? `, with a new Pay Now link for the ${rs(p.balAfter)} still owed` : ''}.` : ` The receipt could not go on WhatsApp because ${o.noPhone ? 'there is no WhatsApp number on file; add it' : 'the number is not on WhatsApp; fix it'} in To do.`;
      const msg = flash === 'safepay' ? <><b>Safepay confirmed the payment.</b> {rs(p.amount)} from {o.name} was recorded and their dues updated, with nobody touching anything.{tail}</>
        : flash === 'proof' ? <><b>Transfer verified.</b> {rs(p.amount)} from {o.name} is recorded.{tail}</>
        : flash === 'staff' ? <><b>Payment recorded.</b> {rs(p.amount)} from {o.name}. Their old Pay Now link was cancelled.{tail}</> : null;
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

export function OwnerModal({ m, o }: { m: string; o: Owner }) {
  const S = cur(), bal = balance(o);
  switch (m) {
    case 'recpay': return <ModalShell title="Record bank payment"><form action={act.recordPaymentAction} style={col}>{hidden(o)}
      <div className="callout">For money paid straight into Minawa&apos;s bank account, outside Safepay. {o.name} owes {rs(Math.max(0, bal))}.</div>
      <div className="form-row"><label htmlFor="rp-amt">Amount (Rs)</label><input id="rp-amt" name="amt" type="number" min="1" step="1" required defaultValue={Math.max(0, bal) || ''} /></div>
      <div className="form-row"><label htmlFor="rp-m">Method</label><select id="rp-m" name="method"><option>Bank deposit</option><option>Bank transfer outside the provider</option><option>Cheque</option><option>Cash at the office</option></select></div>
      <div className="form-row"><label htmlFor="rp-ref">Bank reference</label><input id="rp-ref" name="ref" type="text" placeholder="e.g. FT2611044417" required /></div>
      <div className="m-actions"><CloseBtn /><Submit>Record payment</Submit></div></form></ModalShell>;
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
        {isAdmin() ? null : <div className="form-row"><label htmlFor="dc-w">Reason for the admin (optional)</label><input id="dc-w" name="why" type="text" placeholder="e.g. Agreed with the owner for paying the year in advance" /></div>}
        {isAdmin() ? <div className="callout">Applies to bills from the next billing day. Recorded with your name.</div>
          : <div className="callout warn"><div>An admin has to approve this first. Once approved, it applies to bills from the next billing day.</div></div>}
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
        <div className="callout good">Dues cleared. {o.name}&apos;s account will be closed with a final statement, and the buyer gets a new account billed from the transfer date.</div>
        <div className="form-row"><label htmlFor="tr-n">Buyer&apos;s name</label><input id="tr-n" name="name" type="text" required /></div>
        <div className="form-row"><label htmlFor="tr-p">Buyer&apos;s WhatsApp number</label><input id="tr-p" name="phone" type="tel" required placeholder="+92 3xx xxx xxxx" /></div>
        <div className="form-row"><label htmlFor="tr-d">Transfer and possession date</label><input id="tr-d" name="d" type="date" required defaultValue={S.today} min={addDays(S.today, -90)} max={S.today} /></div>
        <div className="m-actions"><CloseBtn /><Submit>Transfer and open buyer account</Submit></div></form></ModalShell>;
    case 'disconnect': return <ModalShell title="Record disconnection"><form action={act.disconnectAction} style={col}>{hidden(o)}<div className="form-row"><label htmlFor="ds">Service disconnected</label><select id="ds" name="service">{SERVICES.map(s => <option key={s}>{s}</option>)}</select></div><div className="callout">Recorded against {o.apt} with today&apos;s date. Restoration is recorded once dues are paid.</div><div className="m-actions"><CloseBtn /><Submit className="btn danger">Record disconnection</Submit></div></form></ModalShell>;
    case 'fix': return <ModalShell title={o.noPhone ? 'Add WhatsApp number' : 'Fix WhatsApp number'}><FixNumberForm pid={o.project} oid={o.id} name={o.name} phone={o.phone} noPhone={o.noPhone} hand={!cur().settings.rules.autoSend} owes={bal > 0} /></ModalShell>;
    case 'edit': return <ModalShell title={`Edit apartment ${o.apt}`}><form action={act.editOwnerAction} style={col}>{hidden(o)}
      <div className="form-row"><label htmlFor="eo-n">Owner&apos;s name</label><input id="eo-n" name="name" required defaultValue={o.name} /></div>
      <div className="form-row"><label htmlFor="eo-p">WhatsApp number</label><input id="eo-p" name="phone" type="tel" defaultValue={o.phone} placeholder="+92 3xx xxx xxxx" /></div>
      <div className="form-row"><label htmlFor="eo-e">Email</label><input id="eo-e" name="email" type="email" defaultValue={o.email} /></div>
      <div className="form-row"><label htmlFor="eo-ps">Possession date (billing day)</label><input id="eo-ps" name="possession" type="date" required defaultValue={o.possessionKnown ? o.possession : ''} /></div>
      <div className="form-row"><label htmlFor="eo-pl">Billing plan (owner&apos;s choice)</label><select id="eo-pl" name="plan" defaultValue={o.plan || 'monthly'}>{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}{k === 'quarterly' ? ' (billed 25 Dec, Mar, Jun, Sep)' : k === 'annual' ? ' (billed each 25 Dec)' : ' (billed each 25th for the next month)'}</option>)}</select></div>
      <div className="form-row"><label htmlFor="eo-r">Own monthly fee (Rs)</label><input id="eo-r" name="ownRate" type="number" min="0" step="1" defaultValue={o.rate || ''} placeholder={`Empty: rate card, ${rs(cardRate(o, billDateOf(nextPeriodFor(o))))} a month`} /><div className="cell-sub">Only for a flat with its own agreed fee. Counts from the {fm(nextPeriodFor(o))} bill.</div></div>
      {isAdmin() ? null : <><div className="callout warn"><div>A change to the billing plan or the monthly fee needs an admin&apos;s approval. The other details save straight away.</div></div>
        <div className="form-row"><label htmlFor="eo-w">Reason for the admin (optional)</label><input id="eo-w" name="why" type="text" placeholder="e.g. Owner asked to pay quarterly" /></div></>}
      <div className="form-row"><label htmlFor="eo-ab"><input id="eo-ab" name="abroad" type="checkbox" defaultChecked={o.abroad} /> Owner lives abroad</label></div>
      {isAdmin() ? <div className="form-row"><label htmlFor="eo-x"><input id="eo-x" name="exempt" type="checkbox" defaultChecked={o.exempt} /> Exempt from billing (directors&apos; flats)</label></div> : null}
      <div className="m-actions"><CloseBtn /><Submit>Save</Submit></div></form></ModalShell>;
    case 'adjust': return <ModalShell title="Adjustment"><form action={adjustAction} style={col}>{hidden(o)}
      <div className="form-row"><label htmlFor="aj-k">Type</label><select id="aj-k" name="kind" defaultValue="charge"><option value="charge">Charge: add to the next bill (repairs, adjustment cost, correction)</option><option value="credit">Credit or waiver: lower what {o.name} owes now</option></select></div>
      <div className="form-row"><label htmlFor="aj-a">Amount (Rs)</label><input id="aj-a" name="amount" type="number" min="1" step="1" required /></div>
      <div className="form-row"><label htmlFor="aj-r">Reason</label><input id="aj-r" name="reason" type="text" required placeholder="e.g. Water tank repair share; agreed waiver of September fine" /></div>
      {isAdmin() ? <div className="callout">Shows in the apartment&apos;s history with your name and the reason.</div>
        : <div className="callout warn"><div>An admin has to approve this first. Once approved, it shows in the apartment&apos;s history with your name and the reason.</div></div>}
      <div className="m-actions"><CloseBtn /><Submit>{isAdmin() ? 'Save adjustment' : 'Send for approval'}</Submit></div></form></ModalShell>;
    case 'send': return SendModal({ o });
    default: return null;
  }
}

/** Send a payment link on WhatsApp: automatically (Meta template) or by hand (wa.me with the text ready). */
function SendModal({ o }: { o: Owner }) {
  const bal = balance(o), bd = duesBreakdown(o), l = activeLink(o);
  if (bal <= 0) return <ModalShell title="Send payment link on WhatsApp"><div className="callout">Nothing owed, so there is no payment link to send.</div><div className="m-actions"><CloseBtn label="Close" /></div></ModalShell>;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const url = l && l.amount === bal ? (appUrl ? `${appUrl}/pay/${l.id}` : l.sp?.url || null) : null;
  const lines = [`Hi ${first(o.name)}, this is Minawa Group.`, '', `Maintenance dues for Apt ${o.apt}:`, ...bd.rows.map(r => `• ${r.short}: ${rs(r.amount)}`), `Dues: ${rs(bd.dues)}`];
  if (bd.fee) lines.push(`Fine ${feePct()}%: ${rs(bd.fee)}`);
  lines.push(`*Total to pay: ${rs(bal)}*`, '');
  if (url) lines.push('Pay securely by debit or credit card (Safepay):', url, '', 'The link is for this exact amount. Your receipt comes here once it is paid.');
  else lines.push('(A fresh payment link is created when you press Send now.)');
  lines.push('', 'Thank you,', 'Minawa Group');
  const text = lines.join('\n'), to = waTestNumber() || intl(o.phone);
  return <ModalShell title="Send payment link on WhatsApp" wide>
    <div className="wa-to"><span className="wa-logo"><Wa /></span><div style={{ minWidth: 0 }}><div className="cell-sub">To</div><b className="num">{o.phone || 'No WhatsApp number'}</b>
      <div className="cell-sub">Apartment {o.apt}, owner {o.name}.{waTestNumber() ? ` Testing mode: it goes to the test number +${waTestNumber()} instead.` : ''}</div></div></div>
    {cur().settings.rules.autoSend ? <div className="form-row"><label htmlFor="waText">Message (for sending by hand)</label><textarea id="waText" readOnly defaultValue={text}></textarea></div> : null}
    <div className="wa-att"><span className="pdf-ic" aria-hidden="true">PDF</span><div className="t"><b>Statement-{o.apt}-{cur().today}.pdf</b><span className="cell-sub">{cur().settings.rules.autoSend ? 'Attached to the automatic message' : 'Optional: attach it in the chat'}</span></div>
      <a className="btn sm" href={`/api/pdf/${o.project}/statement/${o.id}`} download><Ic n="download" s={14} /> Download</a></div>
    <details className="wa-prev"><summary>Preview the PDF</summary><div><DocView d={statementDoc(o, l)} /></div></details>
    <h4 className="tg-h4">Send it</h4>
    {!cur().settings.rules.autoSend ? <div className="wa-ways">
      <div className="wa-way"><div className="t"><b>Send by hand on WhatsApp Web</b><span className="cell-sub">Makes a Pay Now link for exactly {rs(bal)}, opens {o.name}&apos;s chat with the message typed in, and records it on the history once you&apos;ve sent it.</span></div>
        <Go href={`/p/${o.project}/send?type=link&ids=${o.id}&go=1`} className="btn wa"><Wa /> Open in WhatsApp</Go></div>
    </div> : <div className="wa-ways">
      <div className="wa-way"><div className="t"><b>Automatically, from the business number</b><span className="cell-sub">Sends the approved &quot;Payment link&quot; template with the statement PDF and a Pay Now button for exactly {rs(bal)}.</span></div>
        <form action={act.sendLinkAction}>{hidden(o)}<Submit className="btn wa" pendingText="Sending…"><Wa /> Send now</Submit></form></div>
      <div className="wa-way"><div className="t"><b>By hand</b><span className="cell-sub">Copies the text and opens the chat in WhatsApp. Paste it, attach the PDF, send.</span></div>
        <CopyOpen className="btn" text={text} href={`https://wa.me/${to}?text=${encodeURIComponent(text)}`}><Wa /> Copy and open chat</CopyOpen></div>
    </div>}
    <div className="m-actions" style={{ marginTop: 14 }}><CloseBtn /></div>
  </ModalShell>;
}

/** Quick action: pick an apartment to send a link to. */
export function SendPickModal() {
  const list = apartments().filter(x => x.status === 'active' && !x.exempt && balance(x) > 0).sort(aptOrder);
  return <ModalShell title="Send a payment link"><form action={act.pickAction} style={col}><input type="hidden" name="pid" value={cur().project} />
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

/** New possession: a flat handed over to its first owner. Billing starts from the possession date. */
export function PossessionModal() {
  const S = cur(), types = baseTypes(), blocks = [...new Set(S.owners.map(o => o.block).filter(Boolean))].sort();
  const first = nextBillDate(S.today);
  return <ModalShell title="New possession"><form action={possessionAction} style={col}><input type="hidden" name="pid" value={S.project} />
    <div className="callout">For a flat handed over to its first owner. Billing starts on the possession date: the first month is charged from that day. The first bill goes out on the {ord(S.settings.rules.billDay)} after possession (next one: {fd(first)}).</div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor="np-a">Apartment</label><input id="np-a" name="apt" type="text" required placeholder="e.g. C-302" /></div>
      <div className="form-row"><label htmlFor="np-b">Block</label><input id="np-b" name="block" type="text" list="np-blocks" placeholder="e.g. C" /><datalist id="np-blocks">{blocks.map(b => <option key={b} value={b} />)}</datalist></div>
    </div>
    <div className="form-row"><label htmlFor="np-t">Type</label><select id="np-t" name="type" required>{types.map(t => <option key={t} value={t}>{t} · {rs(rateFor(t, S.today))} a month</option>)}</select></div>
    <div className="form-row"><label htmlFor="np-n">Owner&apos;s name</label><input id="np-n" name="name" type="text" required /></div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor="np-p">WhatsApp number</label><input id="np-p" name="phone" type="tel" placeholder="+92 3xx xxx xxxx" /></div>
      <div className="form-row"><label htmlFor="np-e">Email (optional)</label><input id="np-e" name="email" type="email" /></div>
    </div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor="np-d">Possession date</label><input id="np-d" name="possession" type="date" required defaultValue={S.today} /></div>
      <div className="form-row"><label htmlFor="np-pl">Billing plan</label><select id="np-pl" name="plan" defaultValue="monthly">{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    </div>
    <div className="form-row"><label htmlFor="np-x">Note (optional)</label><input id="np-x" name="note" type="text" placeholder="e.g. Keys and meter reading handed over" /></div>
    <div className="m-actions"><CloseBtn keys={['m']} /><Submit>Record possession</Submit></div></form></ModalShell>;
}
