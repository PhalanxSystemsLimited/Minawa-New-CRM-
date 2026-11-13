// New: staff and roles, and the state of each connection (Supabase, WhatsApp, Safepay, the scheduler).
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import { staffAction, inviteAction } from '@/lib/actions';
import { companyAction } from '@/lib/actions-desk';
import { Submit, Go, ModalShell, CloseBtn, PasswordInput } from '@/components/client';
import { ActivityList, lastSeen, roleTag } from '@/components/views/activity';
import { projects as listProjects } from '@/lib/ops';
import { waConfigured, waTestNumber, waDailyCap, sender } from '@/lib/whatsapp';
import { safepayConfigured, safepayMode } from '@/lib/safepay';

export const dynamic = 'force-dynamic';

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireAdmin(), store = await getStore(), staff = await store.listStaff(), co = await store.getCompany();
  const projs = await listProjects(), acts = await store.getLog({ staffOnly: true, limit: 400 });
  const last = new Map<string, { d: string; t: string }>();
  for (const e of acts) if (e.staffId && !last.has(e.staffId)) last.set(e.staffId, { d: e.d, t: e.t });
  const accIds = staff.filter(x => x.role === 'accountant').map(x => x.id);
  const accActs = acts.filter(e => e.staffId && accIds.includes(e.staffId) && e.kind !== 'signin').slice(0, 8);
  const sorted = [...staff].sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || a.name.localeCompare(b.name));
  const ed = sp.edit ? staff.find(x => x.id === sp.edit) : null, keys = ['edit', 'add'];
  let wa = { from: '', name: '', quality: '', error: '' };
  if (waConfigured()) { try { wa = { ...(await sender()), error: '' }; } catch (e) { wa.error = (e as Error).message; } }
  const app = process.env.APP_URL || '';
  const row = (name: string, ok: boolean, what: string, tag?: string) => <div className="li"><div className="t"><div className="a">{name}</div><div className="b">{what}</div></div>{ok ? <span className={`tag ${tag === 'warn' ? 'warn' : 'good'}`}>{tag && tag !== 'warn' ? tag : 'On'}</span> : <span className="tag bad">Not set up</span>}</div>;
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Staff &amp; connections</div></div><div className="crumb-path">Dashboard<span>/</span>Staff &amp; connections</div></div>
    <div className="card"><div className="card-row"><h3>Staff <small>who can sign in</small></h3><Go href="/admin?add=1" className="btn primary sm">+ Add someone</Go></div>
      <div className="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Last active</th><th></th></tr></thead><tbody>
        {sorted.map(s => { const l = last.get(s.id); return <tr key={s.id}>
          <td><b>{s.name}</b>{s.id === me.id ? <span className="cell-sub"> · you</span> : null}</td>
          <td className="cell-sub">{s.email}</td>
          <td>{roleTag(s.role)}</td>
          <td>{s.active ? <span className="tag good">Can sign in</span> : <span className="tag bad">Turned off</span>}</td>
          <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{l ? lastSeen(l.d, l.t) : 'Not yet'}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}><Go href={`/admin/activity?who=${encodeURIComponent(s.id)}`} className="btn sm">Activity</Go> <Go href={`/admin?edit=${encodeURIComponent(s.id)}`} className="btn sm">Edit</Go></td>
        </tr>; })}
      </tbody></table></div>
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>Admins can change rates, rules, templates, discounts and transfers, and manage staff. Accountants record payments, check transfers, enter utility bills, send notices and payment links, record new possessions and set the fine %.</p>
    </div>
    <div className="card"><div className="card-row"><h3>Accountant activity <small>latest</small></h3><Go href="/admin/activity?who=accountants" className="btn sm">See all</Go></div>
      <ActivityList list={accActs} staff={staff} projects={projs} empty="Nothing yet. Everything an accountant does (payments, notes, utility bills, notices, links, fines) shows here." />
    </div>
    {sp.add ? <ModalShell title="Add someone" closeKeys={keys}>
      <form action={inviteAction} className="rules-form">
        <div className="form-row"><label htmlFor="iv-n">Name</label><input id="iv-n" name="name" required /></div>
        <div className="form-row"><label htmlFor="iv-e">Email (they sign in with it)</label><input id="iv-e" name="email" type="email" autoComplete="off" required /></div>
        <div className="form-row"><label htmlFor="iv-r">Role</label><select id="iv-r" name="role" defaultValue="accountant"><option value="accountant">Accountant</option><option value="admin">Admin (CEO, directors)</option></select></div>
        <div className="form-row"><label htmlFor="iv-p">Password (8+ characters)</label><PasswordInput id="iv-p" name="password" autoComplete="new-password" minLength={8} required /></div>
        <p className="cell-sub" style={{ margin: 0 }}>They can sign in straight away. Give them the email and password yourself.</p>
        <div className="m-actions"><CloseBtn keys={keys} /><Submit>Add</Submit></div>
      </form></ModalShell> : null}
    {ed ? <ModalShell title={`Edit ${ed.name}`} closeKeys={keys}>
      <form action={staffAction} className="rules-form"><input type="hidden" name="id" value={ed.id} />
        <div className="form-row"><label htmlFor="ed-n">Name</label><input id="ed-n" name="name" defaultValue={ed.name} required /></div>
        <div className="form-row"><label htmlFor="ed-e">Email (they sign in with it)</label><input id="ed-e" name="email" type="email" autoComplete="off" defaultValue={ed.email} required /></div>
        <div className="form-row"><label htmlFor="ed-r">Role</label><select id="ed-r" name="role" defaultValue={ed.role}><option value="accountant">Accountant</option><option value="admin">Admin (CEO, directors)</option></select></div>
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
        {row('WhatsApp Business (Meta Cloud API)', waConfigured(), waConfigured() ? (wa.error ? `Connected, but: ${wa.error}` : `${wa.from}${wa.name ? ` · ${wa.name}` : ''}${wa.quality ? ` · quality ${wa.quality}` : ''}${waTestNumber() ? ` · testing: all messages go to +${waTestNumber()}` : ' · sending to owners'}${waDailyCap() ? ` · daily limit ${waDailyCap().toLocaleString('en-US')} people` : ''}`) : 'Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.', waTestNumber() ? 'warn' : undefined)}
        {row('WhatsApp webhook', !!process.env.WHATSAPP_VERIFY_TOKEN, `${app || 'https://your-crm'}/api/whatsapp/webhook · delivery, read receipts, owners' replies and screenshots`)}
        {row('Safepay', safepayConfigured(), safepayConfigured() ? (safepayMode() === 'live' ? 'Live: real card payments' : 'Sandbox: test payments only (set SAFEPAY_ENV=production to go live)') : 'Set SAFEPAY_SECRET_KEY. Until then Pay Now opens a simulated checkout.', safepayMode() === 'live' ? 'Live' : 'warn')}
        {row('Safepay webhook', !!process.env.SAFEPAY_WEBHOOK_SECRET, `${app || 'https://your-crm'}/api/safepay/webhook`)}
        {row('Daily run and sending', !!process.env.CRON_SECRET, 'Supabase pg_cron calls /api/cron/daily at 10:00 and /api/cron/dispatch every 10 minutes (supabase/migrations/0002_schedule.sql).')}
        {row('Address for Pay Now buttons', !!app, app ? `${app}/pay/…` : 'Set APP_URL to the CRM\'s public address.')}
      </div></div>
      <div className="card"><h3>Before go-live <small>from Minawa&apos;s checklist</small></h3><ul className="rules">
        <li>Meta Business account verified (unverified accounts can message only 250 people a day; Country Club alone has 274 flats).</li>
        <li>A sending number Minawa owns, not on WhatsApp yet, shown as &quot;Minawa Group&quot;.</li>
        <li>The message templates approved by Meta (Settings › Message templates › Submit to Meta).</li>
        <li>Safepay merchant approval: business registration, NTN, directors&apos; CNICs, address, receiving bank account.</li>
        <li>Owners&apos; WhatsApp numbers and possession dates, imported in each project&apos;s Apartments › Import.</li>
        <li>Bank account per building, printed on bills (each project&apos;s Settings).</li>
        <li>Remove WHATSAPP_TEST_NUMBER, so messages go to owners.</li>
      </ul></div>
    </div>
  </>;
}
