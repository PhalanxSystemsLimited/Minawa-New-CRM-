'use client';
// Payment amount checks on the entry forms (21 Nov 2026). Watches the form's amount: above what the customer owes it
// asks for a tick ("the extra becomes advance credit"); above the most one entry can take it blocks the form. The
// server checks the same (lib/actions.ts).
import { useEffect, useRef, useState } from 'react';

const rs = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-US');

export function AmountGuard({ owed, cap, name = 'amt', who }: { owed: number; cap: number; name?: string; who: string }) {
  const box = useRef<HTMLDivElement>(null), [amt, setAmt] = useState(0), [ok, setOk] = useState(false);
  useEffect(() => {
    const form = box.current?.closest('form'), inp = form?.elements.namedItem(name) as HTMLInputElement | null;
    if (!inp) return;
    const upd = () => { const v = Math.round(+inp.value || 0); setAmt(v); inp.setCustomValidity(v > cap ? `Rs ${v.toLocaleString('en-US')} is far more than ${who} could owe. The most one entry can take is ${rs(cap)}: check the amount.` : ''); };
    upd(); inp.addEventListener('input', upd); return () => inp.removeEventListener('input', upd);
  }, [name, cap, who]);
  const over = amt > owed && amt <= cap, block = amt > cap;
  return <div ref={box} className="amt-guard" aria-live="polite">
    {block ? <div className="callout bad"><div><b>{rs(amt)} can&apos;t be entered.</b> {who} owes {rs(owed)}; the most one entry can take is {rs(cap)}. Check the amount (a zero too many?). If it really is right, ask the Admin to enter it.</div></div>
      : over ? <label className="callout warn amt-ok"><input type="checkbox" name="over" value="1" required checked={ok} onChange={e => setOk(e.target.checked)} />
        <span><b>{rs(amt)} is more than the {rs(owed)} {who} owes.</b> The extra {rs(amt - owed)} becomes advance credit for the next bills. Tick to confirm the amount is right.</span></label> : null}
  </div>;
}
