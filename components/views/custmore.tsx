// The customer's actions (21 Nov 2026, on the customer's page): Enter payment, Send on WhatsApp, and More, a panel of
// every action in groups: payments and reminders, the customer's details, charges (these wait for the Admin's
// approval when a building manager or the Accountant asks; an Admin's apply at once), documents, and leaving.
// The basic ones (details, notes, promise to pay, payments, WhatsApp) save at once. Runs in engine scope (cur()).
import { cur, balance, billsOf, isAdmin, hasGenerator, openingDue } from '@/lib/engine';
import { pendingFor } from '@/lib/approvals';
import { Go } from '@/components/client';
import { Ic } from '@/components/icons';
import { Wa } from '@/components/icons';
import { restoreAction } from '@/lib/actions';
import type { Owner } from '@/lib/types';

type Item = { href?: string; ext?: boolean; icon: string; label: string; sub: string; apv?: boolean; danger?: boolean; off?: string; form?: React.ReactNode };

export function customerActions(o: Owner, base: string) {
  const S = cur(), pid = o.project, bal = balance(o), closed = o.status === 'closed', role = S.role, admin = isAdmin(), mgr = role === 'accountant';   // the desk work (25 Nov 2026: the Accountant's)
  const m = (k: string) => `${base}?m=${k}`, apv = !admin;
  const genWait = pendingFor(o).some(a => a.kind === 'generator'), activeSusp = o.suspensions.filter(s => !s.to);
  const late = bal > 0 && billsOf(o).some(b => b.dueDate < S.today && b.net > b.paid) || (o.openingLeft > 0 && S.today > openingDue());
  const groups: [string, string, Item[]][] = [];
  if (!closed) {
    groups.push(['Payments & reminders', 'save at once', [
      ...(bal > 0 && role !== 'admin' ? [{ href: m('recpay'), icon: 'cash', label: 'Record a cash payment', sub: 'cash or bank transfer, with a receipt' }] : []),
      ...(bal <= 0 && role !== 'admin' ? [{ href: m('recpay'), icon: 'cash', label: 'Record a payment', sub: 'kept as advance for the next bills' }] : []),
      ...(admin ? [{ href: m('recpay'), icon: 'cash', label: 'Record a payment above the limit', sub: 'for a large amount checked by you' }] : []),
      ...(mgr && bal > 0 && !o.exempt ? [{ href: m('send'), icon: 'send', label: 'Send dues on WhatsApp', sub: 'opens the chat with the message typed in' }] : []),
      { href: bal > 0 ? m('promise') : undefined, off: bal > 0 ? undefined : 'Nothing is owed', icon: 'cal', label: 'Promise to pay', sub: 'pauses reminders until the promised date' },
      { href: `${base}?doc=statement:${o.id}`, icon: 'receipt', label: 'Statement of dues', sub: 'what is owed now, to send or print' },
    ]]);
    groups.push(['Customer details', 'save at once', [
      { href: m('edit'), icon: 'edit', label: 'Edit details', sub: 'name, CNIC, WhatsApp number, email' + (admin ? '' : ' (plan, fee or possession date need approval)') },
      ...(o.invalidPhone ? [{ href: m('fix'), icon: 'phone', label: o.noPhone ? 'Add WhatsApp number' : 'Fix WhatsApp number', sub: 'and resend the latest balance' }] : []),
      { href: m('note'), icon: 'clip', label: 'Add a note', sub: 'what the customer said on a call' },
    ]]);
    groups.push(['Charges', admin ? 'apply at once' : 'need the Admin\'s approval', [
      { href: m('adjust'), icon: 'swap', label: 'Adjustment', sub: 'a charge on the next bill, or a credit / waiver', apv },
      { href: m('discount'), icon: 'percent', label: 'Discount', sub: 'a % or a fixed amount, optional end date', apv },
      ...(o.openingLeft > 0 ? [{ href: m('instal-3'), icon: 'list', label: o.instalments ? 'Change the instalment plan' : 'Instalment plan', sub: 'old arrears in parts, each with a due date', apv }] : []),
      { href: m('due'), icon: 'clock', label: 'Due date for this customer', sub: 'their own day of the month', apv },
      ...(hasGenerator() && mgr ? [genWait ? { off: 'Waiting for the Admin', icon: 'fuel', label: 'Generator change waiting', sub: 'the Admin approves or rejects it first' }
        : { href: m('generator'), icon: 'fuel', label: o.generator ? 'Remove generator charges' : 'Add generator charges', sub: 'from the next bill', apv }] : []),
      ...(role !== 'accountant' && (o.flagged || late) ? [{ href: m('discontinue'), icon: 'ban', label: o.flagged ? 'Resume maintenance' : 'Discontinue maintenance', sub: o.flagged ? 'services back on' : 'for dues long overdue', apv, danger: !o.flagged }] : []),
    ]]);
  }
  groups.push(['Documents', 'PDF', [
    { href: `/api/pdf/${pid}/history/${o.id}`, ext: true, icon: 'file', label: 'Payment history', sub: 'every payment, with receipts' },
    { href: `/api/pdf/${pid}/apthistory/${o.id}`, ext: true, icon: 'history', label: 'Apartment history', sub: `everyone who had ${o.apt}` },
    ...(closed ? [] : [{ href: m('clearance'), icon: 'shieldok', label: 'Dues clearance certificate', sub: 'only when nothing is owed' }]),
  ]]);
  if (!closed) {
    const out: Item[] = [];
    if (role !== 'accountant') out.push({ href: `/p/${pid}/apartments/${o.id}/leave`, icon: 'door', label: 'Customer left', sub: 'hand back the keys; charges must be cleared', apv });
    if (admin) out.push({ href: m('transfer'), icon: 'key', label: 'Transfer to a new owner', sub: 'after all dues are cleared' });
    if (o.flagged) out.push({ href: m('disconnect'), icon: 'bolt', label: 'Record disconnection', sub: 'a service cut for unpaid dues', danger: true });
    if (activeSusp.length && bal <= 0) out.push({ icon: 'okc', label: 'Record restoration', sub: 'services back on', form: <form action={restoreAction}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} /><button type="submit" className="cm-item"><span className="cm-ic"><Ic n="okc" s={16} /></span><span className="cm-t"><b>Record restoration</b><small>services back on</small></span></button></form> });
    if (out.length) groups.push(['Leaving & services', '', out]);
  }
  const item = (x: Item, i: number) => {
    if (x.form) return <div key={i}>{x.form}</div>;
    const inner = <><span className="cm-ic"><Ic n={x.icon} s={16} /></span><span className="cm-t"><b>{x.label}</b><small>{x.off || x.sub}</small></span>{x.apv ? <span className="cm-apv" title="Waits for the Admin's approval">Approval</span> : null}</>;
    if (!x.href) return <button key={i} type="button" className="cm-item" aria-disabled="true" disabled>{inner}</button>;
    if (x.ext) return <a key={i} className="cm-item menu-a" href={x.href} target="_blank" rel="noopener">{inner}</a>;
    return <Go key={i} href={x.href} className={'cm-item' + (x.danger ? ' danger' : '')}>{inner}</Go>;
  };
  return <div className="cus-acts no-print">
    {!closed && bal > 0 && role !== 'admin' ? <Go href={m('recpay')} className="btn primary"><Ic n="cash" s={16} /> Record cash payment</Go> : null}
    {!closed && bal > 0 && !o.exempt && mgr ? <Go href={m('send')} className="btn wa"><Wa /> Send on WhatsApp</Go> : null}
    <details className="more cm-more"><summary className="btn"><Ic n="menu" s={16} /> More</summary>
      <div className="menu cm-menu" role="menu">
        {groups.filter(g => g[2].length).map(([h, note, items]) => <section className="cm-group" key={h}><div className="cm-h">{h}{note ? <small>{note}</small> : null}</div>{items.map(item)}</section>)}
      </div>
    </details>
    <Go href={`/p/${pid}/apartments/${o.id}`} className="btn"><Ic n="building" s={16} /> Open flat {o.apt}</Go>
  </div>;
}
