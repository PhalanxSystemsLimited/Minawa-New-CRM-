'use client';
// Draft a maintenance notice: pick a type, fill in where/when/why, edit the text freely, choose who gets it,
// and see the WhatsApp message before sending.
import { useMemo, useState } from 'react';
import { Submit } from './client';
import { Wa } from './icons';

interface Preset { key: string; label: string; title: string; text: string }
interface Flat { id: string; apt: string; block: string; name: string; noPhone: boolean }

export function NoticeComposer({ presets, flats, blocks, project, pid, action, today, hand }: { presets: Preset[]; flats: Flat[]; blocks: string[]; project: string; pid: string; action: (fd: FormData) => Promise<void>; today: string; hand?: boolean }) {
  const [kind, setKind] = useState(presets[0].key);
  const p = presets.find(x => x.key === kind)!;
  const [where, setWhere] = useState('all blocks'), [when, setWhen] = useState(''), [reason, setReason] = useState('');
  const [title, setTitle] = useState(p.title), [text, setText] = useState(''), [edited, setEdited] = useState(false);
  const [aud, setAud] = useState('all'), [picked, setPicked] = useState<string[]>([]), [q, setQ] = useState('');
  const auto = (pr: Preset, w = where, wh = when, r = reason) => pr.text.replace('{{where}}', w || '…').replace('{{when}}', wh || '…').replace('{{reason}}', r || '…');
  const body = edited ? text : auto(p);
  const choose = (k: string) => { const pr = presets.find(x => x.key === k)!; setKind(k); setTitle(pr.title); setEdited(k === 'custom'); setText(k === 'custom' ? '' : auto(pr)); };
  const count = useMemo(() => aud === 'all' ? flats.length : aud.startsWith('block:') ? flats.filter(f => f.block === aud.slice(6)).length : picked.length, [aud, picked, flats]);
  const noPhone = (aud === 'all' ? flats : aud.startsWith('block:') ? flats.filter(f => f.block === aud.slice(6)) : flats.filter(f => picked.includes(f.id))).filter(f => f.noPhone).length;
  const preview = `Maintenance notice from Minawa Group, ${project}:\n\n${title}\n${body}\n\nFor help, reply to this message.`;
  return <form action={action} className="nc">
    <input type="hidden" name="pid" value={pid} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="text" value={body} /><input type="hidden" name="aud" value={aud} />
    {picked.map(id => <input key={id} type="hidden" name="apt" value={id} />)}
    <div className="nc-types">{presets.map(x => <button type="button" key={x.key} className="chipbtn" aria-pressed={kind === x.key} onClick={() => choose(x.key)}>{x.label}</button>)}</div>
    <div className="grid2" style={{ gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {kind !== 'custom' ? <div className="grid3">
          <div className="form-row"><label htmlFor="nc-w">Where</label><input id="nc-w" type="text" value={where} onChange={e => { setWhere(e.target.value); if (!edited) setText(auto(p, e.target.value)); }} placeholder="e.g. Block C" /></div>
          <div className="form-row"><label htmlFor="nc-d">When</label><input id="nc-d" type="text" value={when} onChange={e => { setWhen(e.target.value); if (!edited) setText(auto(p, where, e.target.value)); }} placeholder={`e.g. ${today}, 10 am to 2 pm`} /></div>
          <div className="form-row"><label htmlFor="nc-r">Reason</label><input id="nc-r" type="text" value={reason} onChange={e => { setReason(e.target.value); if (!edited) setText(auto(p, where, when, e.target.value)); }} placeholder="e.g. tank cleaning" /></div>
        </div> : null}
        <div className="form-row"><label htmlFor="nc-t">Title</label><input id="nc-t" name="title" type="text" required value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-row"><label htmlFor="nc-m">Message {edited && kind !== 'custom' ? <button type="button" className="link-btn" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => { setEdited(false); }}>Back to the template</button> : null}</label>
          <textarea id="nc-m" required value={body} onChange={e => { setEdited(true); setText(e.target.value); }} style={{ minHeight: 120 }} placeholder="Write the notice…"></textarea></div>
        <div className="form-row"><label htmlFor="nc-a">Send to</label>
          <select id="nc-a" value={aud} onChange={e => setAud(e.target.value)}>
            <option value="all">All owners ({flats.length})</option>
            {blocks.map(b => <option key={b} value={`block:${b}`}>Block {b} ({flats.filter(f => f.block === b).length})</option>)}
            <option value="pick">Chosen apartments…</option>
          </select></div>
        {aud === 'pick' ? <div className="nc-pick">
          <input className="search" type="search" placeholder="Find apartment or owner" value={q} onChange={e => setQ(e.target.value)} />
          <div className="tg-list" style={{ maxHeight: 220 }}>{flats.filter(f => !q || `${f.apt} ${f.name}`.toLowerCase().includes(q.toLowerCase())).map(f =>
            <label className="tg-row" key={f.id}><input type="checkbox" checked={picked.includes(f.id)} onChange={e => setPicked(x => e.target.checked ? [...x, f.id] : x.filter(y => y !== f.id))} /><span className="t"><b>{f.apt}</b> · {f.name}</span>{f.noPhone ? <span className="tag bad">No number</span> : null}</label>)}</div>
        </div> : null}
      </div>
      <div>
        <div className="form-row"><label>WhatsApp preview</label></div>
        <div className="wa-bubble"><div className="wa-bubble-in">{preview}</div><div className="wa-bubble-t">Minawa Group · now</div></div>
        <p className="cell-sub" style={{ margin: '8px 0 0' }}>{hand ? 'Next, each owner\'s chat opens in WhatsApp Web with this message typed in; you press Send for each one.' : <>Goes out as the approved &quot;Maintenance notice&quot; template, so it reaches owners even if they haven&apos;t messaged recently.</>}</p>
      </div>
    </div>
    <div className="m-actions" style={{ marginTop: 14 }}><span className="muted" style={{ fontSize: 12.5, marginRight: 'auto', alignSelf: 'center' }}>{count} owner{count === 1 ? '' : 's'}{noPhone ? `, ${noPhone} without a working WhatsApp number` : ''}</span><Submit className="btn wa" pendingText={hand ? 'Preparing…' : 'Sending…'} disabled={!count || !body.trim()}><Wa /> {hand ? 'Next: send' : 'Send'} to {count} owner{count === 1 ? '' : 's'}</Submit></div>
  </form>;
}
