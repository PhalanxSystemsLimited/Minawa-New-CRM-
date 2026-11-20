// Settings (the demo's viewSettings), plus reminder rules, bank details and the daily run.
import { cur, rateTypes, rateFor, getTarget, isAdmin, billDateOf, balance } from '@/lib/engine';
import { fd, fds, fm, rs, ord, addDays, hour12 } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Submit } from '@/components/client';
import { Wa } from '@/components/icons';
import { projectPage, projHead } from '@/components/views/project';
import { TargetOpts, ApplyTo } from '@/components/views/modals';
import { ApprovalItem } from '@/components/views/approvals';
import { pendingProject } from '@/lib/approvals';
import { ratesAction, rulesAction, fineAction, projectBankAction } from '@/lib/actions';
import { bankOf } from '@/lib/bank';
import { waTestNumber } from '@/lib/whatsapp';
import { flatList, isFree } from '@/lib/people';

export const dynamic = 'force-dynamic';

export default async function Settings({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), ad = isAdmin(), dis = !ad, r = S.settings.rules;
    if (S.role === 'manager') return <>{projHead('settings')}<div className="card allclear"><div className="big">Settings are looked after by the Admin and Accountant</div><p className="muted">To change something for one owner (plan, discount, due date), open the apartment and send a request.</p></div></>;
    // Accountants can change the fees, the schedule, the fine and send announcements: each change waits for an admin.
    const waiting = pendingProject();
    const why = (id: string) => ad ? null : <div className="form-row"><label htmlFor={id}>Reason for the admin <span className="req">(required)</span></label><input id={id} name="why" type="text" required placeholder="Why this change is needed" /></div>;
    const save = (label: string) => ad ? label : 'Send for approval';
    const types = rateTypes(), blocks = [...new Set(S.owners.filter(o => o.status === 'active').map(o => o.block))];
    const froms = [...new Set(S.rates.map(x => x.from))].sort();
    const curFrom = [...froms].reverse().find(f => f <= S.today) || froms[0] || `${S.today.slice(0, 4)}-01-01`;
    const nextFrom = froms.find(f => f > S.today) || `${+S.today.slice(0, 4) + 1}-01-01`;
    const hid = <input type="hidden" name="pid" value={pid} />;
    const p = S.today.slice(0, 7), t = getTarget(p);
    const lateOwners = S.owners.filter(o => o.status === 'active' && !o.exempt && o.feeDue > 0 && balance(o) > 0), late = lateOwners.length, lateFines = lateOwners.reduce((a, o) => a + o.feeDue, 0);
    return <>
      {projHead('settings')}
      <div className="page-head"><div><h2>Settings</h2><p>{ad ? 'Admins (the CEO and directors) can change everything here. Changes accountants make to the fees, the billing schedule and the fine come to you for approval. Announcements are in Send on WhatsApp.' : 'You can change the monthly fees, the billing schedule and the fine. Each change goes to an admin for approval with your reason, and applies only once approved.'}</p></div></div>
      {waiting.length ? <div className="card apv-card"><div className="card-row"><h3>Waiting for approval <small>{waiting.length} change{waiting.length === 1 ? '' : 's'} to {S.proj.name}&apos;s settings</small></h3><Go href="/approvals" className="btn sm">Approvals</Go></div>
        <div className="apv-list">{waiting.map(a => <ApprovalItem key={a.id} v={{ a, apt: '', owner: '', pname: S.proj.name }} admin={ad} meId={S.staffId || ''} back={`/p/${pid}/settings`} />)}</div></div> : null}
      <div className="grid2">
        <div className="card"><h3>Monthly fees by apartment type <small>rate card</small></h3>
          <form action={ratesAction}>{hid}<div className="tbl-wrap"><table className="m-keep rate-tbl"><thead><tr><th>Type</th><th className="r">From {fd(curFrom)}</th><th className="r">From <input type="date" name="from" defaultValue={nextFrom} className="th-date" aria-label="New rates start on" /></th></tr></thead><tbody>
            {types.map(ty => <tr key={ty}><td className="cell-main">{ty}</td><td className="r num">{rs(rateFor(ty, S.today))}</td><td className="r"><input className="fee-in num" type="number" min="0" step="100" name={`r:${ty}`} defaultValue={rateFor(ty, nextFrom)} aria-label={`${ty} rate from ${fd(nextFrom)}`} /></td></tr>)}
          </tbody></table></div>
          {why('why-rates')}
          <div style={{ marginTop: 10 }}><ApplyTo /></div>
          <div className="m-actions" style={{ marginTop: 10 }}><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>New rates apply to bills from that date; the old rates stay in the history. &quot;The current bill too&quot; corrects every customer&apos;s unpaid current bill.</span><Submit>{save('Save rates')}</Submit></div></form>
        </div>
        <div className="card" id="fine"><h3>Fine after the due date <small>{ad ? 'accountants\' changes come to you for approval' : 'needs approval'}</small></h3>
          <form action={fineAction} className="rules-form">{hid}
            <div className="rule"><label htmlFor="fn-p">Fine</label><div className="rule-in"><input id="fn-p" name="feePct" type="number" min="0" max="50" step="0.5" defaultValue={r.feePct} /><span>% of the unpaid bills, added the day after the due date</span></div></div>
            <label className="cb"><input type="checkbox" name="fineArrears" defaultChecked={r.fineArrears} /> Also fine old arrears (opening balances from before {fm(S.goLive.slice(0, 7))})</label>
            <p className="cell-sub" style={{ margin: 0 }}>{late} owner{late === 1 ? ' is' : 's are'} late right now, with {rs(lateFines)} in fines. The fine grows with each new bill while dues stay unpaid, and payments pay it off in proportion.</p>
            <label className="cb"><input type="checkbox" name="apply" defaultChecked /> Apply the new % to the {late} late owner{late === 1 ? '' : 's'} now</label>
            <label className="cb"><input type="checkbox" name="send" /> and send them their updated dues on WhatsApp</label>
            {why('why-fine')}
            <div className="m-actions"><Submit>{save('Save fine')}</Submit></div>
          </form>
        </div>
      </div>
        <div className="card"><h3>Billing schedule <small>new bills use these</small></h3>
          <form action={rulesAction} className="rules-form">{hid}
            <div className="rule"><label>Due date</label><div className="rule-in"><span>each customer&apos;s possession day, every 1, 6 or 12 months by their plan; with no possession date on file, the 1st of the month</span></div></div>
            <div className="rule"><label htmlFor="ru-lead">Bill and &quot;send bill&quot; To do</label><div className="rule-in"><input id="ru-lead" name="billLead" type="number" min="1" max="60" defaultValue={r.billLead} /><span>days before the due date</span></div></div>
            <div className="rule"><label htmlFor="ru-warn">Late payment warning</label><div className="rule-in"><input id="ru-warn" name="warnAfter" type="number" min="1" max="60" defaultValue={r.warnAfter} /><span>days after the due date, if still unpaid (the building manager decides on the fine)</span></div></div>
            <div className="rule"><label htmlFor="ru-ut">Utility bills</label><div className="rule-in"><input id="ru-ut" name="utilities" defaultValue={r.utilities.join(', ')} placeholder="e.g. Electricity" style={{ width: 220 }} /><span>entered by the building manager, added to the next bill</span></div></div>
            <p className="cell-sub" style={{ margin: '4px 0 0' }}>Bills and late warnings are made on time and wait in the building manager&apos;s <b>Send on WhatsApp</b>, where they are sent by hand. Nothing is fined or discontinued automatically.</p>
            {why('why-rules')}
            <div className="m-actions"><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>Last run: {S.settings.lastRun ? fd(S.settings.lastRun) : 'not yet'}.</span><Submit>{save('Save schedule')}</Submit></div>
          </form>
        </div>
      <div className="card"><div className="card-row"><h3>Monthly target <small>{fm(p)}: {rs(t.total)}</small></h3><Go href={`/p/${pid}/settings?m=target`} className="btn sm">See breakdown</Go></div>
        <p className="muted" style={{ margin: '-6px 0 12px', fontSize: 13 }}>Set on the 1st: what every billed flat owes for the month at the rate card. By default discounts come off and exempt or on-hold flats aren&apos;t counted. Turn either on for every flat, or pick flats one by one.</p>
        {TargetOpts('s')}</div>
      <div className="grid2">
        <div className="card"><h3>WhatsApp and payments <small>{S.proj.name}</small></h3>
          <div className="list">
            <div className="li"><div className="t"><div className="a"><Wa inl /> WhatsApp</div><div className="b">Sent by hand from Send on WhatsApp{waTestNumber() ? ` · testing: chats open with +${waTestNumber()}` : ''}</div></div><span className={`tag ${waTestNumber() ? 'warn' : 'good'}`}>{waTestNumber() ? 'Testing' : 'By hand'}</span></div>
            <div className="li"><div className="t"><div className="a">Payments</div><div className="b">By hand: the building manager enters cash or a bank transfer (with its transaction ID), and the Accountant approves it</div></div><span className="tag good">By hand</span></div>
          </div>
          {ad ? <p className="cell-sub" style={{ margin: '10px 0 0' }}>Keys are set on the server. See <Go href="/admin" className="link-btn">Staff &amp; connections</Go> for what each one does.</p> : null}</div>
        {(() => { const b = bankOf(S.proj.bank); return <div className="card" id="bank"><h3>Bank account for transfers <small>printed on vouchers and in WhatsApp messages</small></h3>
          {ad ? <form action={projectBankAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{hid}
            <div className="form-row"><label htmlFor="bk-t">Account title</label><input id="bk-t" name="title" defaultValue={b?.title || ''} placeholder="Minawa Group (Pvt) Ltd – Maintenance" /></div>
            <div className="grid2" style={{ gap: 10 }}>
              <div className="form-row"><label htmlFor="bk-b">Bank name</label><input id="bk-b" name="bank" defaultValue={b?.bank || ''} placeholder="e.g. Meezan Bank, Bhurban branch" /></div>
              <div className="form-row"><label htmlFor="bk-a">Account number or IBAN</label><input id="bk-a" name="account" defaultValue={b?.account || ''} placeholder="PK00 XXXX 0000 0000 0000 0000" /></div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" name="all" value="1" /> Use this account for every building</label>
            <div><Submit>Save bank account</Submit></div>
            <p className="cell-sub" style={{ margin: 0 }}>Leave the account number empty to remove it: messages and vouchers then ask for cash only.</p>
          </form> : b ? <div className="list"><div className="li"><div className="t"><div className="a">{b.title}</div><div className="b">{b.bank} · A/C {b.account}</div></div></div></div>
            : <p className="empty">No bank account set: customers are asked to pay in cash. The Admin sets it here.</p>}
        </div>; })()}
      </div>
      {(() => { const fl = flatList(), free = fl.filter(isFree).length; return <div className="card" id="flats"><div className="card-row"><h3 data-hic="building" data-tone="blue">Apartments <small>{fl.length} in {S.proj.name} · {fl.length - free} possessed or booked · {free} available</small></h3><Go href={`/apartments?p=${pid}`} className="btn sm">Open Apartments</Go></div>
        <p className="cell-sub" style={{ margin: 0 }}>{ad ? 'Add apartments and change their details on the Apartments screen (left menu). New possessions pick from the available ones.' : 'The Admin adds apartments and changes their details on the Apartments screen.'}</p></div>; })()}
      <details className="card rules-card"><summary>How the system works</summary><ul className="rules">
        {r.startOn ? <li>Go-live on {fd(r.startOn)}: every customer with a balance gets a statement for it, due on the {ord(r.dueDays)} of the next month. Monthly charges start in {fm(S.goLive.slice(0, 7))}; the months before are in the opening balances.</li> : null}
        <li>Customers pay in cash to the building manager against the bill voucher, or by bank transfer into Minawa&apos;s account above. The building manager enters each payment (receipt number for cash, transaction ID for a transfer); the owner&apos;s balance changes once the Accountant confirms it, and the receipt goes to the building manager&apos;s To do to send on WhatsApp. The Accountant can also record cash paid at the office. Every message tells the owner to pay in cash to the building manager.</li>
        <li>Each customer is due on their possession day, every month, every 6 months or once a year by their plan (a few existing customers stay quarterly); with no possession date on file, on the 1st. A bill covers the period up to the day before its due date (possession 20 Nov, monthly: 20 Nov – 19 Dec, due 20 Dec); a first part-period is charged by the day.</li>
        <li>The bill, and the building manager&apos;s &quot;send bill&quot; To do, is made {r.billLead} days before each due date. If it is still unpaid {r.warnAfter} days after the due date, a late payment warning waits in the building manager&apos;s To do; he decides when sending whether to add the fine ({r.feePct}% of what is late).</li>
        <li>Nothing is discontinued automatically: after the warning the building manager can ask to discontinue maintenance, and the Admin approves it. Royal Enclave flats on the Generator list get a separate generator line on each bill.</li>
        <li>Changes to what a customer pays (rates, discount, generator, own fee) apply from the next bill, or to the current bill too as a correction line. Old bills are never recalculated, so the history shows what was charged when.</li>
        <li>A payment covers dues and the late fee in proportion, so the fee stays {r.feePct}% of what is still owed; dues are paid oldest first. Extra money becomes advance credit for the next bills.</li>
        <li>A promise to pay pauses notices until the promised date; if it passes unpaid, the accountant is alerted.</li>
        <li>Directors&apos; apartments are exempt. Discounts can be a percentage or fixed, with an optional end date.</li>
        <li>A transfer NOC needs a Dues Clearance certificate, issued only at a zero balance.</li>
        <li>WhatsApp messages are sent by hand: they wait in Send on WhatsApp, staff open each owner&apos;s chat with the message typed in, and confirm it was sent.</li>
        <li>Each month&apos;s collection target is set on the 1st: what every billed flat owes for the month at the rate card. This month: {rs(t.total)}.</li>
      </ul></details>
    </>;
  });
}
