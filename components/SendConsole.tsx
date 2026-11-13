'use client';
// Send on WhatsApp by hand. 1) What to send. 2) Who: one by one, a block, everyone who owes, or everyone.
// 3) One owner at a time: open the chat in WhatsApp Web with the message typed in and send it there. Coming back to the
//    CRM asks "Did you send the message?" (WaReturnPrompt); the answer is recorded and the next owner comes up.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareSendAction, recordSentAction, dropPendingAction } from '@/lib/actions-send';
import type { SendItem, SendType } from '@/lib/manual-send';
import { Wa, Ic } from './icons';
import { awaitReturn, clearAwait, type WaAnswer } from './WaReturnPrompt';

export interface SendRow {
  id: string; apt: string; block: string; name: string; phone: string; hold: boolean; bal: number; balTxt: string; overdue: boolean;
  waiting: string[]; last: string | null; sentToday: boolean; why: Record<SendType, string | null>;
}
type Scope = 'all' | 'owing' | 'overdue' | 'pick' | `block:${string}`;
type Done = 'saving' | 'sent' | 'skipped' | 'aside' | 'error' | 'notsent';
const VARS = '{{name}} {{apt}} {{total}} {{due}} {{project}}';

/** wa.me numbers: digits only, 03xx… → 923xx… */
const digits = (p: string) => { let d = p.replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1); return d; };

export function SendConsole({ pid, rows, blocks, types, start, ids, go, notice, waiting }: {
  pid: string; rows: SendRow[]; blocks: string[]; types: { key: SendType; label: string; hint: string }[]; start: SendType; ids: string[]; go: boolean; notice: string; waiting: number;
}) {
  const router = useRouter();
  const [type, setType] = useState<SendType>(start);
  const [scope, setScope] = useState<Scope>(ids.length ? 'pick' : 'all');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ids));
  const [q, setQ] = useState(''), [showOut, setShowOut] = useState(false);
  const [title, setTitle] = useState('Message from Minawa Group'), [text, setText] = useState(''), [pay, setPay] = useState(false);
  const [step, setStep] = useState<'pick' | 'run' | 'done'>('pick'), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [items, setItems] = useState<SendItem[]>([]), [left, setLeft] = useState<{ apt: string; why: string }[]>([]), [test, setTest] = useState<string | null>(null);
  const [i, setI] = useState(0), [opened, setOpened] = useState(false), [edits, setEdits] = useState<Record<string, string>>({}), [done, setDone] = useState<Record<string, Done>>({});
  const [via, setVia] = useState<'web' | 'app'>('web');
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {   // phones can't use WhatsApp Web: open the app there unless the accountant chose otherwise
    let v: string | null = null; try { v = localStorage.getItem('minawa.waVia'); } catch { /* private mode */ }
    if (v === 'app' || v === 'web') setVia(v); else if (window.matchMedia?.('(pointer: coarse)').matches) setVia('app');
  }, []);
  const setViaSave = (v: 'web' | 'app') => { setVia(v); try { localStorage.setItem('minawa.waVia', v); } catch { /* ignore */ } };

  const inScope = (r: SendRow, s: Scope = scope) => s === 'all' || s === 'pick' ? true : s === 'owing' ? r.bal > 0 : s === 'overdue' ? r.overdue : r.block === s.slice(6);
  const can = useMemo(() => rows.filter(r => !r.why[type]), [rows, type]);
  const out = useMemo(() => rows.filter(r => r.why[type] && inScope(r)), [rows, type, scope]);   // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => can.filter(r => inScope(r) && (!q || `${r.apt} ${r.name} ${r.phone} ${r.block}`.toLowerCase().includes(q.toLowerCase()))), [can, scope, q]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Changing what or who: everyone eligible in that group is ticked (none when choosing one by one).
  const reset = (t: SendType, s: Scope) => setPicked(new Set(s === 'pick' ? [] : rows.filter(r => !r.why[t] && inScope(r, s)).map(r => r.id)));
  const chooseType = (t: SendType) => { setType(t); reset(t, scope); setErr(''); };
  const chooseScope = (s: Scope) => { setScope(s); reset(type, s); };
  useEffect(() => { if (!ids.length) reset(type, scope); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = can.filter(r => picked.has(r.id));
  const allTicked = list.length > 0 && list.every(r => picked.has(r.id));
  const toggleAll = () => setPicked(p => { const n = new Set(p); for (const r of list) allTicked ? n.delete(r.id) : n.add(r.id); return n; });

  async function begin(forIds = chosen.map(r => r.id)) {
    if (!forIds.length && !(type === 'queue' && notice)) return;
    if (type === 'custom' && !text.trim()) { setErr('Write the message first.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await prepareSendAction({ pid, type, ids: forIds, title, text, pay, notice: notice || undefined });
      setItems(r.items); setLeft(r.left); setTest(r.test); setI(0); setOpened(false); setEdits({}); setDone({});
      setStep(r.items.length ? 'run' : 'done');
      if (!r.items.length && !r.left.length) setErr('Nothing to send for these owners.');
    } catch (e) { setErr((e as Error).message || 'Something went wrong. Try again.'); }
    setBusy(false);
  }
  useEffect(() => { if (go) begin(type === 'queue' && notice ? [] : ids); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const it = items[i], body = it ? (edits[it.key] ?? it.text) : '';
  const to = it ? (test || digits(it.to || it.phone)) : '';
  const chatUrl = it ? (via === 'web' ? `https://web.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(body)}` : `https://wa.me/${to}?text=${encodeURIComponent(body)}`) : '';
  const openChat = () => { awaitReturn(pid, { ...it, text: body }, to); const w = window.open(chatUrl, 'minawa-whatsapp'); try { w?.focus(); } catch { /* ignore */ } setOpened(true); };
  const next = () => { setOpened(false); if (i + 1 < items.length) setI(i + 1); else { setStep('done'); router.refresh(); } };
  const mark = (k: string, v: Done) => setDone(d => ({ ...d, [k]: v }));
  const sent = () => {
    const item = { ...it, text: body }; clearAwait(item.key); mark(item.key, 'saving');
    // Saved in the background, in order, so the next chat can open straight away.
    chain.current = chain.current.then(() => recordSentAction({ pid, item, via: 'button' }).then(r => { mark(item.key, r.ok ? 'sent' : 'error'); if (!r.ok) setErr(`${item.apt}: not saved (${r.error}). Mark it again from the list.`); }, () => mark(item.key, 'error')));
    next();
  };
  const skip = () => { clearAwait(it.key); mark(it.key, 'skipped'); next(); };
  // The answer to "Did you send the message?" (already saved by the prompt): Yes moves on, No stays on this owner.
  const onAnswer = useRef<(a: WaAnswer) => void>(() => undefined);
  onAnswer.current = a => {
    if (a.sent) { mark(a.key, 'sent'); if (it?.key === a.key) next(); }
    else { mark(a.key, 'notsent'); if (it?.key === a.key) setOpened(false); }
  };
  useEffect(() => {
    const f = (e: Event) => onAnswer.current((e as CustomEvent<WaAnswer>).detail);
    window.addEventListener('minawa:wa-answer', f); return () => window.removeEventListener('minawa:wa-answer', f);
  }, []);
  const aside = () => { clearAwait(it.key); const k = it.key, ids2 = [it.fromMsg!, ...it.replaces]; mark(k, 'aside'); chain.current = chain.current.then(() => dropPendingAction({ pid, ids: ids2 })); next(); };
  const n = (v: Done) => Object.values(done).filter(x => x === v).length;
  const sentN = n('sent') + n('saving');

  if (step === 'pick') return <div className="card sc">
    <h3>1. What to send</h3>
    <div className="nc-types">{types.map(t => <button type="button" key={t.key} className="chipbtn" aria-pressed={type === t.key} onClick={() => chooseType(t.key)}>{t.label}{t.key === 'queue' ? <> <span className="n">{waiting}</span></> : null}</button>)}</div>
    <p className="cell-sub sc-hint">{types.find(t => t.key === type)?.hint}.{type === 'queue' && !waiting ? ' Nothing is waiting right now: bills, reminders and receipts appear here as the CRM makes them.' : ''}</p>
    {type === 'custom' ? <div className="sc-custom">
      <div className="form-row"><label htmlFor="sc-t">Title (for the history)</label><input id="sc-t" type="text" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-row"><label htmlFor="sc-m">Message</label><textarea id="sc-m" value={text} onChange={e => setText(e.target.value)} placeholder={'Dear {{name}}, …'} style={{ minHeight: 110 }}></textarea>
        <span className="cell-sub">Filled in for each owner: {VARS}. For water, lift or electricity notices you can also use <a href={`/p/${pid}/notices`}>Notices</a>.</span></div>
      <label className="tg-row" style={{ border: 0, padding: 0 }}><input type="checkbox" checked={pay} onChange={e => setPay(e.target.checked)} /><span className="t">Add a Pay Now link for owners who owe</span></label>
    </div> : null}

    <h3 style={{ marginTop: 18 }}>2. Who gets it</h3>
    <div className="nc-types">
      {([['all', 'Everyone'], ['owing', 'Owing'], ['overdue', 'Overdue'], ['pick', 'Choose one by one']] as [Scope, string][]).map(([k, l]) =>
        <button type="button" key={k} className="chipbtn" aria-pressed={scope === k} onClick={() => chooseScope(k)}>{l} <span className="n">{rows.filter(r => !r.why[type] && inScope(r, k)).length}</span></button>)}
      {blocks.length ? <select className="sc-block" aria-label="Block" value={scope.startsWith('block:') ? scope : ''} onChange={e => e.target.value && chooseScope(e.target.value as Scope)}>
        <option value="">By block…</option>{blocks.map(b => <option key={b} value={`block:${b}`}>Block {b} ({rows.filter(r => !r.why[type] && r.block === b).length})</option>)}</select> : null}
    </div>
    <div className="sc-bar"><input className="search" type="search" placeholder="Find apartment, owner or number" value={q} onChange={e => setQ(e.target.value)} aria-label="Find" />
      <label className="sc-all"><input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={!list.length} /> Tick all shown</label></div>
    <div className="tg-list sc-list">{list.length ? list.map(r =>
      <label className="tg-row sc-row" key={r.id}><input type="checkbox" checked={picked.has(r.id)} onChange={e => setPicked(p => { const s2 = new Set(p); e.target.checked ? s2.add(r.id) : s2.delete(r.id); return s2; })} />
        <span className="t"><b>{r.apt}</b> · {r.name}<span className="cell-sub"> {r.phone}</span></span>
        <span className="sc-tags">{r.waiting.length && type === 'queue' ? <span className="tag info">{r.waiting.join(', ')}</span> : null}{r.overdue ? <span className="tag bad">Overdue</span> : null}{r.sentToday ? <span className="tag warn" title="Something was already sent to this owner today">Messaged today</span> : null}</span>
        <span className={`num sc-bal${r.bal > 0 ? '' : ' muted'}`}>{r.balTxt}</span></label>) : <p className="empty" style={{ padding: 14 }}>{q ? 'Nobody matches.' : 'Nobody here can get this message.'}</p>}</div>
    {out.length ? <div className="sc-out"><button type="button" className="link-btn" onClick={() => setShowOut(!showOut)}>{showOut ? 'Hide' : 'Show'} {out.length} who can&apos;t get this</button>
      {showOut ? <ul>{out.map(r => <li key={r.id}><b>{r.apt}</b> {r.name}: {r.why[type]}</li>)}</ul> : null}</div> : null}
    {err ? <div className="callout bad" style={{ marginTop: 12 }}><div>{err}</div></div> : null}
    <div className="m-actions" style={{ marginTop: 14 }}><span className="muted" style={{ fontSize: 12.5, marginRight: 'auto', alignSelf: 'center' }}>{chosen.length} owner{chosen.length === 1 ? '' : 's'} ticked</span>
      <button type="button" className="btn wa" disabled={!chosen.length || busy} onClick={() => begin()}><Wa /> {busy ? 'Preparing…' : `Start sending to ${chosen.length}`}</button></div>
  </div>;

  if (step === 'done' || !it) return <div className="card sc">
    <h3>Done</h3>
    <p>{sentN} sent{n('skipped') ? `, ${n('skipped')} skipped` : ''}{n('aside') ? `, ${n('aside')} set aside` : ''}{n('notsent') ? `, ${n('notsent')} not sent` : ''}{n('error') ? `, ${n('error')} not saved` : ''}. Each sent message is on the owner&apos;s history.</p>
    {left.length ? <div className="sc-out"><b>Not included ({left.length})</b><ul>{left.map((x, k) => <li key={k}><b>{x.apt}</b>: {x.why}</li>)}</ul></div> : null}
    {err ? <div className="callout bad"><div>{err}</div></div> : null}
    <div className="m-actions"><button type="button" className="btn primary" onClick={() => { setStep('pick'); router.refresh(); }}>Send something else</button></div>
  </div>;

  return <div className="sc-run">
    <div className="card sc-main">
      <div className="card-row"><h3>{i + 1} of {items.length}</h3><span className="muted" style={{ fontSize: 12.5 }}>{sentN} sent{n('skipped') ? ` · ${n('skipped')} skipped` : ''}</span></div>
      <div className="sc-prog" aria-hidden="true"><span style={{ width: `${100 * i / items.length}%` }}></span></div>
      <div className="wa-to"><span className="wa-logo"><Wa /></span><div style={{ minWidth: 0 }}><div className="cell-sub">To</div><b className="num">+{to}</b>
        <div className="cell-sub">Apartment {it.apt}, {it.name}{test ? ` · testing, the owner's number is ${it.phone}` : ''}</div></div></div>
      <div className="form-row"><label htmlFor="sc-body">{it.title} <span className="cell-sub">(you can edit it here before opening the chat)</span></label>
        <textarea id="sc-body" value={body} onChange={e => setEdits(x => ({ ...x, [it.key]: e.target.value }))} style={{ minHeight: 210 }}></textarea></div>
      {it.pdfHref ? <div className="wa-att"><span className="pdf-ic" aria-hidden="true">PDF</span><div className="t"><b>{it.pdf?.kind === 'receipt' ? 'Receipt' : it.pdf?.kind === 'bill' ? 'Bill' : 'Statement'} PDF</b><span className="cell-sub">Optional: download it and attach it in the chat</span></div>
        <a className="btn sm" href={it.pdfHref} download><Ic n="download" s={14} /> Download</a></div> : null}
      {done[it.key] === 'notsent' ? <div className="callout warn" style={{ marginTop: 10 }}><div>Saved as <b>not sent</b>. Open the chat again to send it, or Skip.</div></div>
        : !opened ? <p className="cell-sub" style={{ margin: '10px 0 0' }}>Open the chat, press Send in WhatsApp, then come back here: the CRM asks whether it went and records your answer.</p> : null}
      {err ? <div className="callout bad" style={{ marginTop: 10 }}><div>{err}</div></div> : null}
      <div className="sc-acts">
        <button type="button" className={`btn ${opened ? '' : 'wa'}`} onClick={openChat}><Wa /> {opened ? 'Open the chat again' : 'Open chat in WhatsApp'}</button>
        <button type="button" className="btn" onClick={sent} title="If the question didn't appear when you came back"><Ic n="check" s={15} /> Mark as sent</button>
        <button type="button" className="btn" onClick={skip}>Skip</button>
        {it.fromMsg ? <button type="button" className="link-btn" onClick={aside} title="Don't send this one at all; it leaves the Ready to send list">Don&apos;t send this</button> : null}
        {i > 0 ? <button type="button" className="link-btn" onClick={() => { setOpened(false); setI(i - 1); }}>Back</button> : null}
      </div>
      <div className="sc-via"><span className="cell-sub">Open chats in</span>
        <button type="button" className="chipbtn" aria-pressed={via === 'web'} onClick={() => setViaSave('web')}>WhatsApp Web</button>
        <button type="button" className="chipbtn" aria-pressed={via === 'app'} onClick={() => setViaSave('app')}>WhatsApp app</button>
        <button type="button" className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => { setStep('done'); router.refresh(); }}>Stop here</button></div>
    </div>
    <div className="card sc-side"><h3>Queue</h3>
      <ol className="sc-q">{items.map((x, k) => { const st = done[x.key];
        return <li key={x.key} className={k === i ? 'on' : ''}><button type="button" onClick={() => { setOpened(false); setI(k); }}><b>{x.apt}</b> <span className="cell-sub">{x.name}</span></button>
          {st === 'sent' ? <span className="tag good">Sent</span> : st === 'saving' ? <span className="tag">Saving…</span> : st === 'skipped' ? <span className="tag">Skipped</span> : st === 'aside' ? <span className="tag">Not sending</span> : st === 'notsent' ? <span className="tag warn">Not sent</span> : st === 'error' ? <span className="tag bad">Not saved</span> : null}</li>; })}</ol>
      {left.length ? <div className="sc-out"><b>Not included ({left.length})</b><ul>{left.map((x, k) => <li key={k}><b>{x.apt}</b>: {x.why}</li>)}</ul></div> : null}
    </div>
  </div>;
}
