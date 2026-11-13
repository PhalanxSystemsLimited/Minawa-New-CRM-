// The Pay Now button in every WhatsApp message opens this address. It sends the owner straight to the Safepay
// page for the exact amount, or explains when the link was replaced or already paid.
import { redirect } from 'next/navigation';
import { getStore } from '@/lib/store';
import { load } from '@/lib/ops';
import { use, ownerById, duesBreakdown, balance, activeLink, feePct } from '@/lib/engine';
import { ensureSafepay } from '@/lib/dispatch';
import { safepayConfigured } from '@/lib/safepay';
import { receiptDoc } from '@/lib/docdata';
import { rs, fd, first } from '@/lib/fmt';
import { DocView } from '@/components/views/modals';
import { Submit } from '@/components/client';
import { simulatePayAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Pay({ params, searchParams }: { params: Promise<{ linkId: string }>; searchParams: Promise<{ done?: string }> }) {
  const { linkId } = await params, { done } = await searchParams;
  const store = await getStore(), at = await store.locate({ linkId });
  const frame = (body: React.ReactNode) => <div className="login"><div className="login-card card pay-card"><div className="login-brand"><span className="logo-pill"><img src="/assets/minawa-logo.png" alt="Minawa Group" /></span></div>{body}</div></div>;
  if (!at) return frame(<><div className="proj-title" style={{ fontSize: 24 }}>Link not found</div><p className="muted">Please use the Pay Now button in your latest WhatsApp message from Minawa Group.</p></>);
  let s = await load(at.project, null);
  let l = s.links.find(x => x.id === linkId)!;
  // Make the Safepay link on first open if the dispatcher hasn't yet.
  if (l.status === 'active' && !l.sp && safepayConfigured()) {
    await store.withLock(async () => { s = await load(at.project, null); l = s.links.find(x => x.id === linkId)!; await ensureSafepay(s, l); await store.saveState(s); });
  }
  if (l.status === 'active' && l.sp?.url && !done) redirect(l.sp.url);

  return use(s, () => {
    const o = ownerById(l.ownerId), proj = s.proj;
    const head = <><div className="eyebrow-b">{proj.name} · Apt {o.apt}</div></>;
    if (l.status === 'paid' || done) {
      const p = [...s.payments].reverse().find(x => x.linkId === l.id);
      return frame(<>{head}<div className="proj-title" style={{ fontSize: 26 }}>Thank you, {first(o.name)}</div><p className="muted">Your payment{p ? ` of ${rs(p.amount)}` : ''} was received{l.paidOn ? ` on ${fd(l.paidOn)}` : ''}. Your receipt has been sent on WhatsApp.</p>{p ? <div style={{ marginTop: 12 }}><DocView d={receiptDoc(p)} /></div> : null}</>);
    }
    if (l.status === 'cancelled') {
      const now = activeLink(o);
      return frame(<>{head}<div className="proj-title" style={{ fontSize: 24 }}>This link was replaced</div><p className="muted">A newer message with the up-to-date amount was sent to you, so this link no longer works.</p>
        {now ? <a className="btn primary" href={`/pay/${now.id}`}>Pay the current balance, {rs(now.amount)}</a> : balance(o) <= 0 ? <div className="callout good"><div>Nothing is owed right now. Thank you.</div></div> : null}</>);
    }
    const bd = duesBreakdown(o);
    return frame(<>{head}<div className="proj-title" style={{ fontSize: 26 }}>Pay {rs(l.amount)}</div>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Maintenance dues for Apartment {o.apt}, {o.name}.</p>
      <table className="bd-t"><tbody>{bd.rows.map(r => <tr key={r.label}><td>{r.label}{r.sub ? <div className="cell-sub">{r.sub}</div> : null}</td><td className="r num">{rs(r.amount)}</td></tr>)}
        {bd.fee ? <tr><td>Fine {feePct()}%</td><td className="r num">{rs(bd.fee)}</td></tr> : null}<tr className="bd-tot"><td>Total</td><td className="r num">{rs(l.amount)}</td></tr></tbody></table>
      {l.spError ? <div className="callout bad" style={{ marginTop: 12 }}><div>The card payment page isn&apos;t available right now. Please try again in a few minutes, or pay by bank transfer to {proj.bank || 'Minawa Group'} with reference {o.apt}.</div></div> : null}
      {!safepayConfigured() && process.env.ALLOW_SIMULATED_PAYMENTS === 'true' ? <form action={simulatePayAction} style={{ marginTop: 14 }}><input type="hidden" name="pid" value={at.project} /><input type="hidden" name="id" value={l.id} />
        <div className="callout warn" style={{ marginBottom: 10 }}><div><b>Test checkout.</b> Safepay isn&apos;t connected, so this simulates a card payment confirmed by Safepay.</div></div>
        <div className="m-actions"><Submit pendingText="Processing…">Pay {rs(l.amount)}</Submit></div></form> : null}
    </>);
  });
}
