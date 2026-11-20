// Generator Charges List: which flats pay the generator rate (Royal Enclave: 15,000 a month) and which the normal rate
// (12,000). Tick flats to add or remove them; the change counts from each flat's next unbilled month.
import { cur, isAdmin, apartments, aptOrder, hasGenerator, rateFor, rateOf, nextPeriodFor, nextBillFor, billDateOf, genFeeAt, balance } from '@/lib/engine';
import { fm, fd, rs } from '@/lib/fmt';
import { GeneratorList, type GenRow } from '@/components/GeneratorList';
import { projectPage, projHead } from '@/components/views/project';

import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/session';
import { KIc } from '@/components/views/art';
export const dynamic = 'force-dynamic';

export default async function GeneratorPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  if ((await requireStaff()).role !== 'manager') redirect(`/p/${pid}?flash=${encodeURIComponent('The generator charges list is kept by the building manager.')}`);
  return projectPage(pid, sp, () => {
    const S = cur();
    if (!hasGenerator()) return <>{projHead('generator')}<div className="card allclear"><div className="big">No generator charges here</div><p className="muted">{S.proj.name} has no generator charges. The Admin sets the amount in Settings › Monthly fees (Generator charges).</p></div></>;
    const flats = apartments().filter(o => o.status === 'active').sort(aptOrder);
    const waits = new Map(S.approvals.filter(a => a.kind === 'generator' && a.status === 'pending').map(a => [a.ownerId, a.change.on ? 'on' as const : 'off' as const]));
    const rows: GenRow[] = flats.map(o => {
      const p = nextPeriodFor(o), d = billDateOf(p), fee = rateOf(o, d), alt = o.rate || (rateFor(o.type, d) + (o.generator ? 0 : genFeeAt(d, o.type)));
      return { id: o.id, apt: o.apt, block: o.block || '', name: o.name, on: !!o.generator, fee, feeTxt: rs(fee), altTxt: rs(alt), own: o.rate ? rs(o.rate) : null, hold: !!o.exempt, from: fm(p), bal: balance(o) > 0 ? rs(balance(o)) : '', wait: waits.get(o.id) || null };
    });
    const g = genFeeAt(S.today) || genFeeAt(billDateOf(S.goLive.slice(0, 7)));
    const on = flats.filter(o => o.generator && !o.rate && !o.exempt).length, off = flats.filter(o => !o.generator && !o.rate && !o.exempt).length;
    const own = flats.filter(o => o.rate && !o.exempt), hold = flats.filter(o => o.exempt).length;
    const billed = flats.filter(o => !o.exempt), nextBill = billed.map(o => nextBillFor(o)).sort()[0] || null;
    const nextP = billed.map(o => nextPeriodFor(o)).sort()[0] || null;
    const blocks = [...new Set(flats.map(o => o.block).filter(Boolean))].sort();
    const monthly = flats.filter(o => !o.exempt).reduce((a, o) => a + rateOf(o, billDateOf(nextPeriodFor(o))), 0);
    return <>
      {projHead('generator')}
      <div className="page-head"><div><h2>Generator charges</h2><p>Flats with a generator connection pay their apartment fee <b>plus {rs(g)}</b> generator charges a month (two lines on the bill); the others pay the apartment fee only. Tick flats to add them to the list or take them off. A change counts from the flat&apos;s next bill: bills already made, and what owners already owe, don&apos;t change.{isAdmin() ? '' : ' Your changes wait for an admin\'s approval before they apply.'}</p></div></div>
      <div className="kpis gen-kpis">
        <div className="kpi"><KIc n="fuel" tone="teal" /><div className="l">With generator</div><div className="v num">{on}</div><div className="cell-sub">+ {rs(g)} a month each</div></div>
        <div className="kpi"><KIc n="ban" tone="slate" /><div className="l">Without generator</div><div className="v num">{off}</div><div className="cell-sub">apartment fee only</div></div>
        <div className="kpi"><KIc n="percent" tone="violet" /><div className="l">Own agreed rate</div><div className="v num">{own.length}</div><div className="cell-sub">{[...new Set(own.map(o => rs(o.rate!)))].join(', ') || 'none'}; not changed by the list</div></div>
        <div className="kpi"><KIc n="coins" tone="rust" /><div className="l">Monthly maintenance</div><div className="v num">{rs(monthly)}</div><div className="cell-sub">{hold ? `${hold} flat${hold === 1 ? '' : 's'} on hold not billed` : 'all flats'}{nextBill && nextP ? ` · next bills on ${fd(nextBill)}, for ${fm(nextP)}` : ''}</div></div>
      </div>
      <GeneratorList pid={pid} rows={rows} blocks={blocks} genFee={`+ ${rs(g)} generator charges`} baseFee="no generator charges" admin={isAdmin()} />
      <p className="cell-sub" style={{ marginTop: 10 }}>Generator charges are {rs(g)} a month for every flat on the list. The Admin changes the amount in Settings › Monthly fees (Generator charges), from a chosen date.</p>
    </>;
  });
}
