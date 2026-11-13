// Settings (the demo's viewSettings), plus reminder rules, bank details and the daily run.
import { cur, rateTypes, rateFor, getTarget, isAdmin, billDateOf, balance } from '@/lib/engine';
import { fd, fds, fm, rs, ord, addDays, hour12 } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Submit } from '@/components/client';
import { Wa } from '@/components/icons';
import { projectPage, projHead } from '@/components/views/project';
import { TargetOpts } from '@/components/views/modals';
import { ApprovalItem } from '@/components/views/approvals';
import { pendingProject } from '@/lib/approvals';
import { ratesAction, rulesAction, runDailyAction, projectBankAction, fineAction } from '@/lib/actions';
import { waTestNumber } from '@/lib/whatsapp';
import { safepayConfigured, safepayMode } from '@/lib/safepay';

export const dynamic = 'force-dynamic';

export default async function Settings({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), ad = isAdmin(), dis = !ad, r = S.settings.rules;
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
      <div className="page-head"><div><h2>Settings</h2><p>{ad ? 'Admins (the CEO and directors) can change everything here. Changes accountants make to the fees, the billing schedule and the fine come to you for approval. Announcements are in Send on WhatsApp.' : 'You can change the monthly fees, the billing schedule and the fine. Each change goes to an admin for approval with your reason, and applies only once approved.'}</p></div>
        {ad ? <form action={runDailyAction}>{hid}<Submit className="btn" pendingText="Running…">Run today&apos;s billing now</Submit></form> : null}</div>
      {waiting.length ? <div className="card apv-card"><div className="card-row"><h3>Waiting for approval <small>{waiting.length} change{waiting.length === 1 ? '' : 's'} to {S.proj.name}&apos;s settings</small></h3><Go href="/approvals" className="btn sm">Approvals</Go></div>
        <div className="apv-list">{waiting.map(a => <ApprovalItem key={a.id} v={{ a, apt: '', owner: '', pname: S.proj.name }} admin={ad} meId={S.staffId || ''} back={`/p/${pid}/settings`} />)}</div></div> : null}
      <div className="grid2">
        <div className="card"><h3>Monthly fees by apartment type <small>rate card</small></h3>
          <form action={ratesAction}>{hid}<div className="tbl-wrap"><table><thead><tr><th>Type</th><th className="r">From {fd(curFrom)}</th><th className="r">From <input type="date" name="from" defaultValue={nextFrom} className="th-date" aria-label="New rates start on" /></th></tr></thead><tbody>
            {types.map(ty => <tr key={ty}><td className="cell-main">{ty}</td><td className="r num">{rs(rateFor(ty, S.today))}</td><td className="r"><input className="fee-in num" type="number" min="0" step="100" name={`r:${ty}`} defaultValue={rateFor(ty, nextFrom)} aria-label={`${ty} rate from ${fd(nextFrom)}`} /></td></tr>)}
          </tbody></table></div>
          {why('why-rates')}
          <div className="m-actions" style={{ marginTop: 10 }}><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>New rates apply to bills from that date. Advance credit pays the new rate.</span><Submit>{save('Save rates')}</Submit></div></form>
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
            <div className="rule"><label htmlFor="ru-day">Bills and 1st reminder</label><div className="rule-in"><span>on the</span><input id="ru-day" name="billDay" type="number" min="1" max="28" defaultValue={r.billDay} /><span>of every month, at {hour12(r.sendHour)}</span></div></div>
            <div className="rule"><label htmlFor="ru-due">Due date</label><div className="rule-in"><input id="ru-due" name="dueDays" type="number" min="1" max="60" defaultValue={r.dueDays} /><span>days after the bill ({fds(addDays(billDateOf(S.today.slice(0, 7)), r.dueDays))} for this month&apos;s bills)</span></div></div>
            <div className="rule"><label htmlFor="ru-rem">2nd and 3rd reminders</label><div className="rule-in"><span>on the</span><input id="ru-rem" name="remindOn" defaultValue={r.remindOn.join(', ')} style={{ width: 90 }} /><span>of the month, while the bill is unpaid and before its due date</span></div></div>
            <div className="rule"><label htmlFor="ru-fin">Flag for disconnection</label><div className="rule-in"><input id="ru-fin" name="flagDays" type="number" min="1" max="120" defaultValue={r.flagDays} /><span>days after the due date, if still unpaid</span></div></div>
            <div className="rule"><label htmlFor="ru-ut">Utility bills entered here</label><div className="rule-in"><input id="ru-ut" name="utilities" defaultValue={r.utilities.join(', ')} placeholder="e.g. Electricity, Water" style={{ width: 220 }} /><span>added to the bill on the {ord(r.billDay)}</span></div></div>
            <p className="cell-sub" style={{ margin: '4px 0 0' }}>Bills, reminders, notices and receipts are made on time and wait in <b>Send on WhatsApp</b>, where staff send them by hand.</p>
            {why('why-rules')}
            <div className="m-actions"><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>Last run: {S.settings.lastRun ? fd(S.settings.lastRun) : 'not yet'}.</span><Submit>{save('Save schedule')}</Submit></div>
          </form>
        </div>
      <div className="card"><div className="card-row"><h3>Monthly target <small>{fm(p)}: {rs(t.total)}</small></h3><Go href={`/p/${pid}/settings?m=target`} className="btn sm">See breakdown</Go></div>
        <p className="muted" style={{ margin: '-6px 0 12px', fontSize: 13 }}>Set on the 1st: what every billed flat owes for the month at the rate card. By default discounts come off and exempt or on-hold flats aren&apos;t counted. Turn either on for every flat, or pick flats one by one.</p>
        {TargetOpts('s')}</div>
      <div className="grid2">
        <div className="card"><h3>WhatsApp and Safepay <small>{S.proj.name}</small></h3>
          <div className="list">
            <div className="li"><div className="t"><div className="a"><Wa inl /> WhatsApp</div><div className="b">Sent by hand from Send on WhatsApp{waTestNumber() ? ` · testing: chats open with +${waTestNumber()}` : ''}</div></div><span className={`tag ${waTestNumber() ? 'warn' : 'good'}`}>{waTestNumber() ? 'Testing' : 'By hand'}</span></div>
            <div className="li"><div className="t"><div className="a">Safepay payment links</div><div className="b">{safepayConfigured() ? (safepayMode() === 'live' ? 'Live: real card payments' : 'Sandbox: test payments only') : 'Not connected: Pay Now opens a simulated checkout'}</div></div>{safepayConfigured() ? <span className={`tag ${safepayMode() === 'live' ? 'good' : 'warn'}`}>{safepayMode() === 'live' ? 'Live' : 'Sandbox'}</span> : <span className="tag">Off</span>}</div>
          </div>
          {ad ? <p className="cell-sub" style={{ margin: '10px 0 0' }}>Keys are set on the server. See <Go href="/admin" className="link-btn">Staff &amp; connections</Go> for what each one does.</p> : null}</div>
        <div className="card"><h3>Bank account <small>printed on bills</small></h3>
          <form action={projectBankAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{hid}
            <div className="form-row"><label htmlFor="bk">Account title · bank · IBAN</label><input id="bk" name="bank" defaultValue={S.proj.bank} disabled={dis} placeholder="Minawa Group – Maintenance · Bank · IBAN PK…" /></div>
            <div className="m-actions"><Submit disabled={dis}>Save</Submit></div></form></div>
      </div>
      <details className="card rules-card"><summary>How the system works</summary><ul className="rules">
        <li>Every flat is billed on the {ord(r.billDay)} of the month at {hour12(r.sendHour)}, in advance: monthly flats for the next month (the 25 Nov bill is for December), quarterly flats for the next calendar quarter (billed 25 Dec, Mar, Jun, Sep), annual flats for the next year (billed 25 December). Electricity and other utility bills entered by the accountant go on the same bill. The bill is the first reminder.</li>
        <li>Billing starts at possession: the first month is charged from the possession date. The first bill also covers the rest of the possession month.</li>
        <li>The due date is {r.dueDays} days after the bill. {r.remindOn.length ? `Reminders go out on the ${r.remindOn.map(ord).join(' and ')} of the month while the bill is unpaid, each with a fresh payment link.` : ''} The day after the due date the fine ({r.feePct}% of the unpaid bills{r.fineArrears ? ' and old arrears' : ''}, changed with an admin's approval) is added and a final notice goes out.</li>
        <li>{r.flagDays} days after the due date, flats still unpaid are flagged for disconnection. Paying in full clears the flag.</li>
        <li>Every message carries a fresh payment link for the exact amount; the old one is cancelled. Payments are confirmed by Safepay&apos;s webhook and re-checked with Safepay; while the CRM is open it also checks Safepay every minute, so a missed webhook is caught.</li>
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
