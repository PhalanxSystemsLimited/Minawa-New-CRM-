// Generator Charges List: which flats pay the generator rate (Royal Enclave: 15,000 a month) and which the normal rate
// (12,000). Tick flats to add or remove them; the change counts from each flat's next unbilled month.
import { cur, apartments, aptOrder, hasGenerator, rateFor, rateOf, nextPeriodFor, nextBillFor, billDateOf, baseTypes, genType, balance } from '@/lib/engine';
import { fm, fd, rs } from '@/lib/fmt';
import { GeneratorList, type GenRow } from '@/components/GeneratorList';
import { projectPage, projHead } from '@/components/views/project';

export const dynamic = 'force-dynamic';

export default async function GeneratorPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur();
    if (!hasGenerator()) return <>{projHead('generator')}<div className="card allclear"><div className="big">No generator charges here</div><p className="muted">{S.proj.name} has no generator rate card. An admin can add one in Settings › Monthly fees (a type named &quot;… + generator&quot;).</p></div></>;
    const flats = apartments().filter(o => o.status === 'active').sort(aptOrder);
    const rows: GenRow[] = flats.map(o => {
      const p = nextPeriodFor(o), d = billDateOf(p), fee = rateOf(o, d), alt = o.rate || rateFor(o.generator ? o.type : genType(o.type), d) || rateFor(o.type, d);
      return { id: o.id, apt: o.apt, block: o.block || '', name: o.name, on: !!o.generator, fee, feeTxt: rs(fee), altTxt: rs(alt), own: o.rate ? rs(o.rate) : null, hold: !!o.exempt, from: fm(p), bal: balance(o) > 0 ? rs(balance(o)) : '' };
    });
    const cards = baseTypes().map(t => ({ type: t, base: rateFor(t, S.today) || rateFor(t, billDateOf(S.goLive.slice(0, 7))), gen: rateFor(genType(t), S.today) || rateFor(genType(t), billDateOf(S.goLive.slice(0, 7))) })).filter(c => c.gen);
    const on = flats.filter(o => o.generator && !o.rate && !o.exempt).length, off = flats.filter(o => !o.generator && !o.rate && !o.exempt).length;
    const own = flats.filter(o => o.rate && !o.exempt), hold = flats.filter(o => o.exempt).length;
    const billed = flats.filter(o => !o.exempt), nextBill = billed.map(o => nextBillFor(o)).sort()[0] || null;
    const nextP = billed.map(o => nextPeriodFor(o)).sort()[0] || null;
    const blocks = [...new Set(flats.map(o => o.block).filter(Boolean))].sort();
    const genCard = cards[0], monthly = flats.filter(o => !o.exempt).reduce((a, o) => a + rateOf(o, billDateOf(nextPeriodFor(o))), 0);
    return <>
      {projHead('generator')}
      <div className="page-head"><div><h2>Generator charges</h2><p>Flats with a generator connection pay <b>{genCard ? rs(genCard.gen) : ''}</b> a month; the others pay <b>{genCard ? rs(genCard.base) : ''}</b>. Tick flats to add them to the list or take them off. A change counts from the flat&apos;s next bill: bills already made, and what owners already owe, don&apos;t change.</p></div></div>
      <div className="kpis gen-kpis">
        <div className="kpi"><div className="l">With generator</div><div className="v num">{on}</div><div className="cell-sub">{genCard ? rs(genCard.gen) : ''} a month each</div></div>
        <div className="kpi"><div className="l">Without generator</div><div className="v num">{off}</div><div className="cell-sub">{genCard ? rs(genCard.base) : ''} a month each</div></div>
        <div className="kpi"><div className="l">Own agreed rate</div><div className="v num">{own.length}</div><div className="cell-sub">{[...new Set(own.map(o => rs(o.rate!)))].join(', ') || 'none'}; not changed by the list</div></div>
        <div className="kpi"><div className="l">Monthly maintenance</div><div className="v num">{rs(monthly)}</div><div className="cell-sub">{hold ? `${hold} flat${hold === 1 ? '' : 's'} on hold not billed` : 'all flats'}{nextBill && nextP ? ` · next bills on ${fd(nextBill)}, for ${fm(nextP)}` : ''}</div></div>
      </div>
      <GeneratorList pid={pid} rows={rows} blocks={blocks} genFee={genCard ? rs(genCard.gen) : ''} baseFee={genCard ? rs(genCard.base) : ''} />
      <p className="cell-sub" style={{ marginTop: 10 }}>The two amounts are rate cards ({cards.map(c => `${c.type} ${rs(c.base)}, ${genType(c.type)} ${rs(c.gen)}`).join('; ')}). An admin can change them in Settings › Monthly fees, from a chosen date.</p>
    </>;
  });
}
