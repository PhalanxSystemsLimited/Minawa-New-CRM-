// New: staff and roles, and the state of each connection (Supabase, WhatsApp, the scheduler).
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import { staffAction, inviteAction } from '@/lib/actions';
import { companyAction } from '@/lib/actions-desk';
import { Submit, Go, ModalShell, CloseBtn, PasswordInput } from '@/components/client';
import { StaffAccess } from '@/components/StaffAccess';
import { WaNumbersField } from '@/components/WaNumbersField';
import { Wa } from '@/components/icons';
import { fmtNumber, freeAt, validNumber } from '@/lib/wa-numbers';
import { waExtraAction } from '@/lib/actions';
import { ActivityList, lastSeen, roleTag } from '@/components/views/activity';
import { projects as listProjects } from '@/lib/ops';
import { waTestNumber } from '@/lib/whatsapp';
import { PageIc } from '@/components/views/art';

export const dynamic = 'force-dynamic';

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireAdmin(), store = await getStore(), staff = await store.listStaff(), co = await store.getCompany();
  const projs = await listProjects(me), acts = await store.getLog({ staffOnly: true, limit: 400 });
  const last = new Map<string, { d: string; t: string }>();
  for (const e of acts) if (e.staffId && !last.has(e.staffId)) last.set(e.staffId, { d: e.d, t: e.t });
  const accIds = staff.filter(x => x.role === 'accountant').map(x => x.id);
  const accActs = acts.filter(e => e.staffId && accIds.includes(e.staffId) && !['signin', 'signout'].includes(e.kind)).slice(0, 8);
  const rank = { admin: 0, accountant: 1, manager: 2 } as const, sorted = [...staff].sort((a, b) => (rank[a.role] - rank[b.role]) || a.name.localeCompare(b.name));
  const ed = sp.edit ? staff.find(x => x.id === sp.edit) : null, keys = ['edit', 'add', 'extra'];
  // WhatsApp numbers (20 Nov 2026): every number on someone's details, who uses it, and its use in the last 24 hours.
  const numRows = new Map<string, { number: string; limit: number; people: string[]; labels: Set<string>; on: boolean }>();
  for (const x of staff) for (const n of x.waNumbers || []) if (validNumber(n.number)) {
    const r = numRows.get(n.number) || { number: n.number, limit: n.limit, people: [], labels: new Set<string>(), on: false };
    r.limit = Math.min(r.limit, n.limit); r.people.push(x.name + (x.active ? '' : ' (sign-in off)')); r.labels.add(n.label); r.on = r.on || (n.active && x.active); numRows.set(n.number, r);
  }
  let waUse: Awaited<ReturnType<typeof store.waUsage>> = [];
  try { waUse = await store.waUsage([...numRows.values()].map(r => ({ number: r.number, limit: r.limit }))); } catch (e) { console.error('wa usage', (e as Error).message); }
  const useOf = (n: string) => waUse.find(u => u.number === n), extraN = sp.extra ? numRows.get(sp.extra) : undefined;
  const noNumber = staff.filter(x => x.active && x.role === 'manager' && !(x.waNumbers || []).some(n => n.active));
  const row = (name: string, ok: boolean, what: string, tag?: string) => <div className="li"><div className="t"><div className="a">{name}</div><div className="b">{what}</div></div>{ok ? <span className={`tag ${tag === 'warn' ? 'warn' : 'good'}`}>{tag && tag !== 'warn' ? tag : 'On'}</span> : <span className="tag bad">Not set up</span>}</div>;
  return <>
    <div className="proj-head"><PageIc n="users" tone="blue" /><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Staff &amp; connections</div></div><div className="crumb-path">Dashboard<span>/</span>Staff &amp; connections</div></div>
    <div className="card"><div className="card-row"><h3>Staff <small>who can sign in</small></h3><Go href="/admin?add=1" className="btn primary sm">+ Add someone</Go></div>
      <div className="tbl-wrap"><table className="staff-tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Last active</th><th></th></tr></thead><tbody>
        {sorted.map(s => { const l = last.get(s.id); return <tr key={s.id}>
          <td><b>{s.name}</b>{s.id === me.id ? <span className="cell-sub"> · you</span> : null}</td>
          <td className="cell-sub">{s.email}{(s.waNumbers || []).length ? <div className="wa-nums-cell">{(s.waNumbers || []).map(n => <span key={n.id} className="num" style={{ whiteSpace: 'nowrap' }}><Wa inl /> {fmtNumber(n.number)} <small>{n.label}{n.active ? '' : ', not in use'}</small></span>)}</div> : s.role === 'manager' ? <div><span className="tag warn">No WhatsApp number</span></div> : null}</td>
          <td>{roleTag(s.role)}{s.role !== 'admin' ? <div className="cell-sub">{(s.projects || []).map(id => projs.find(p => p.id === id)?.name || id).join(', ') || <span className="tag warn">No building ticked{s.role === 'accountant' ? ': sees every building until you tick them' : ''}</span>}</div> : null}</td>
          <td>{s.active ? <span className="tag good">Can sign in</span> : <span className="tag bad">Turned off</span>}</td>
          <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{l ? lastSeen(l.d, l.t) : 'Not yet'}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}><Go href={`/log?who=${encodeURIComponent(s.id)}`} className="btn sm">Activity</Go> <Go href={`/admin?edit=${encodeURIComponent(s.id)}`} className="btn sm">Edit</Go></td>
        </tr>; })}
      </tbody></table></div>
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>Admins (the owner and directors) see every building, change rates, plans and the fine, approve requests and manage staff. Accountants approve the payments entered in their buildings; their changes go to an Admin for approval. Building managers and accountants only see the buildings ticked for them, and each must have at least one. Building managers record payments, send reminders on WhatsApp and ask the Admin for changes for an owner.</p>
    </div>
    <div className="card" id="wa"><div className="card-row"><h3 data-hic="send" data-tone="green">WhatsApp numbers <small>daily limit · different customers in any 24 hours</small></h3></div>
      {noNumber.length ? <div className="callout warn" style={{ marginBottom: 12 }}><div><b>{noNumber.map(x => x.name).join(', ')}</b> {noNumber.length === 1 ? 'has' : 'have'} no WhatsApp number, so {noNumber.length === 1 ? 'they' : 'they'} can&apos;t open chats from the CRM. Add it with Edit.</div></div> : null}
      {numRows.size ? <div className="tbl-wrap"><table className="wa-use-tbl"><thead><tr><th>Number</th><th>Used by</th><th>Last 24 hours</th><th>Next place frees up</th><th></th></tr></thead><tbody>
        {[...numRows.values()].map(r => { const u = useOf(r.number), used = u?.used || 0, lim = r.limit + (u?.extra || 0), pc = Math.min(100, Math.round(100 * used / Math.max(1, lim)));
          return <tr key={r.number}><td><b className="num">{fmtNumber(r.number)}</b><div className="cell-sub">{[...r.labels].join(' / ')}{r.on ? '' : ' · not in use'}</div></td>
            <td>{r.people.join(', ')}</td>
            <td style={{ minWidth: 220 }}><div className="wa-use"><span className={'wa-use-bar' + (pc >= 100 ? ' full' : pc >= 80 ? ' near' : '')}><i style={{ width: `${pc}%` }}></i></span><b className="num">{used} of {lim}</b></div>
              <div className="cell-sub">limit {r.limit}{u?.extra ? ` + ${u.extra} extra allowed` : ''}{pc >= 100 ? ' · full' : ''}</div></td>
            <td className="cell-sub">{used ? freeAt(u?.nextFree) : '—'}</td>
            <td className="r"><Go href={`/admin?extra=${encodeURIComponent(r.number)}`} className="btn sm">Allow extra</Go></td></tr>; })}
      </tbody></table></div> : <p className="empty">No WhatsApp numbers yet. Add each person&apos;s numbers with Edit; until then they can&apos;t open chats from the CRM.</p>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>A chat counts when &quot;Open chat&quot; is pressed; a customer messaged again within 24 hours is free. At the limit the number&apos;s chats are locked until a place frees up, or until you allow extra here (with a reason, kept in the activity log). This system sends no email: bills reach customers on WhatsApp, or as printed vouchers for customers without WhatsApp.</p>
    </div>
    {extraN ? <ModalShell title={`Allow extra · ${fmtNumber(extraN.number)}`} closeKeys={keys}>
      <form action={waExtraAction} className="rules-form"><input type="hidden" name="number" value={extraN.number} />
        <div className="callout">Used by {extraN.people.join(', ')}. {useOf(extraN.number)?.used || 0} of {extraN.limit + (useOf(extraN.number)?.extra || 0)} customers in the last 24 hours. The extra lasts 24 hours from now.</div>
        <div className="form-row"><label htmlFor="wx-a">More customers</label><input id="wx-a" name="amount" type="number" min={1} max={1000} step={1} defaultValue={25} required /></div>
        <div className="form-row"><label htmlFor="wx-r">Reason <span className="req">(required)</span></label><input id="wx-r" name="reason" type="text" required maxLength={300} placeholder="e.g. Urgent water notice for Country Club" /></div>
        <div className="m-actions"><CloseBtn keys={keys} /><Submit>Allow extra</Submit></div>
      </form></ModalShell> : null}
    <div className="card"><div className="card-row"><h3>Accountant activity <small>latest</small></h3><Go href="/log?who=accountants" className="btn sm">See all</Go></div>
      <ActivityList list={accActs} staff={staff} projects={projs} empty="Nothing yet. Everything an accountant does (payments, notes, utility bills, notices, fines) shows here." />
    </div>
    {sp.add ? <ModalShell title="Add someone" closeKeys={keys} wide>
      <form action={inviteAction} className="rules-form staff-form">
        <div className="form-row half"><label htmlFor="iv-n">Name</label><input id="iv-n" name="name" required /></div>
        <div className="form-row half"><label htmlFor="iv-e">Email (they sign in with it)</label><input id="iv-e" name="email" type="email" autoComplete="off" required /></div>
        <StaffAccess prefix="iv" role="accountant" projects={projs.map(p => ({ id: p.id, name: p.name }))} picked={[]} saving="create" />
        <WaNumbersField prefix="iv" initial={[]} />
        <div className="form-row"><label htmlFor="iv-p">Password (8+ characters)</label><PasswordInput id="iv-p" name="password" autoComplete="new-password" minLength={8} required /></div>
        <p className="cell-sub" style={{ margin: 0 }}>They can sign in straight away. Give them the email and password yourself.</p>
        <div className="m-actions"><CloseBtn keys={keys} /><Submit>Add</Submit></div>
      </form></ModalShell> : null}
    {ed ? <ModalShell title={`Edit ${ed.name}`} closeKeys={keys} wide>
      <form action={staffAction} className="rules-form staff-form"><input type="hidden" name="id" value={ed.id} />
        <div className="form-row half"><label htmlFor="ed-n">Name</label><input id="ed-n" name="name" defaultValue={ed.name} required /></div>
        <div className="form-row half"><label htmlFor="ed-e">Email (they sign in with it)</label><input id="ed-e" name="email" type="email" autoComplete="off" defaultValue={ed.email} required /></div>
        <StaffAccess key={ed.id} prefix="ed" role={ed.role} projects={projs.map(p => ({ id: p.id, name: p.name }))} picked={ed.role === 'admin' ? [] : ed.projects || []} saving="save" />
        <WaNumbersField key={'n' + ed.id} prefix="ed" initial={ed.waNumbers || []} />
        <div className="form-row"><label htmlFor="ed-p">New password <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(leave empty to keep the current one)</span></label><PasswordInput id="ed-p" name="password" autoComplete="new-password" minLength={8} /></div>
        <label className="cb"><input type="checkbox" name="active" defaultChecked={ed.active} /> Can sign in{ed.id === me.id ? ' (you can\'t turn off your own access)' : ''}</label>
        <div className="m-actions"><CloseBtn keys={keys} /><Submit>Save changes</Submit></div>
      </form></ModalShell> : null}
    <div className="card"><h3>Company details <small>printed on every bill, statement and receipt</small></h3>
      <form action={companyAction} className="grid-add co-form">
        <div className="form-row"><label htmlFor="co-n">Legal name</label><input id="co-n" name="legalName" defaultValue={co.legalName} required /></div>
        <div className="form-row"><label htmlFor="co-a">Registered address</label><input id="co-a" name="address" defaultValue={co.address} /></div>
        <div className="form-row"><label htmlFor="co-t">NTN</label><input id="co-t" name="ntn" defaultValue={co.ntn} /></div>
        <div className="form-row"><label htmlFor="co-p">Phone for owners</label><input id="co-p" name="phone" defaultValue={co.phone} /></div>
        <div className="form-row"><label htmlFor="co-e">Email for owners</label><input id="co-e" name="email" type="email" defaultValue={co.email} /></div>
        <div className="m-actions"><Submit>Save</Submit></div>
      </form></div>
    <div className="grid2">
      <div className="card"><h3>Connections</h3><div className="list">
        {row('Database', true, store.kind === 'supabase' ? 'Supabase' : 'Local file (data/local-db.json): for trying the CRM only. Connect Supabase before go-live.', store.kind === 'supabase' ? 'Supabase' : 'warn')}
        {row('WhatsApp', true, `Sent by hand: staff open each owner's chat from Send on WhatsApp and confirm it was sent${waTestNumber() ? ` · testing: chats open with +${waTestNumber()}` : ' · chats open with the owners'}`, waTestNumber() ? 'warn' : 'By hand')}
        {row('Daily run', true, 'Runs by itself once a day, as soon as anyone has the CRM open: bills on each customer’s billing date, reminders on the 3rd and 7th, the fine and final notice after the due date. What it makes waits in To do, to be sent by hand.', 'Automatic')}
      </div></div>
      <div className="card"><h3>Before go-live <small>from Minawa&apos;s checklist</small></h3><ul className="rules">
        <li>A WhatsApp number Minawa owns for sending by hand, signed in on WhatsApp Web, shown as &quot;Minawa Group&quot;.</li>
        <li>Owners&apos; WhatsApp numbers and possession dates, imported in each project&apos;s Apartments › Import.</li>
        <li>Remove WHATSAPP_TEST_NUMBER, so chats open with the owners.</li>
      </ul></div>
    </div>
  </>;
}
