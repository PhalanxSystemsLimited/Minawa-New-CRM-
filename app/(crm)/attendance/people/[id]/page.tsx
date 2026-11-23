// One employee's attendance (23 Nov 2026): their details, their personal attendance link (the Admin copies or sends
// it), their registered phone (approved by the building manager), and their days month by month, with marking a day by
// hand for whoever approves them.
import { headers } from 'next/headers';
import { requireStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { attCtx, canSee, canApprove, dayView, graceOf, pname, shiftText, offText, roleOf, ROLE_WORD, totals, distText, mapsLink, workDay } from '@/lib/attendance';
import { employeeStateAction, phoneDecisionAction } from '@/lib/actions-att';
import { EmployeeForm, MarkDayForm, statusTag, howText, inOut } from '@/components/views/att';
import { CopyBtn } from '@/components/AttBits';
import { Go, ModalShell, Submit } from '@/components/client';
import { PageIc, Empty } from '@/components/views/art';
import { Ic, IcTile, Wa } from '@/components/icons';
import { addDays, dim, dow, fd, fds, MONL, addMonths, waDigits } from '@/lib/fmt';
import { pkt } from '@/lib/att-notify';

export const dynamic = 'force-dynamic';

export default async function Person({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, sp = await searchParams, me = await requireStaff(), c = await attCtx(), store = await getStore();
  const e = c.employees.find(x => x.id === id);
  if (!e || !canSee(me, e, c.staff)) return <div className="card"><Empty kind="search" title="Not found">This employee isn&apos;t on file, or isn&apos;t in your buildings. <Go href="/attendance/people">All employees</Go></Empty></div>;
  const admin = me.role === 'admin', approver = canApprove(me, e, c.staff), role = roleOf(e, c.staff), grace = graceOf(c, e);
  const mon = /^\d{4}-\d{2}$/.test(sp.mon || '') && sp.mon! <= c.today.slice(0, 7) ? sp.mon! : c.today.slice(0, 7), n = dim(+mon.slice(0, 4), +mon.slice(5, 7));
  const last = mon === c.today.slice(0, 7) ? workDay(e, c.today, c.now.slice(11)) : `${mon}-${String(n).padStart(2, '0')}`;
  const [recs, alerts] = await Promise.all([store.listAttendance({ from: `${mon}-01`, to: `${mon}-${String(n).padStart(2, '0')}`, employeeIds: [e.id] }), store.listAttAlerts({ since: `${mon}-01` })]);
  const days: string[] = []; for (let d = last; d >= `${mon}-01`; d = addDays(d, -1)) days.push(d);
  const views = days.map(d => { const r = recs.find(x => x.d === d) || null; return { d, r, v: dayView(e, d, r, c.now, grace) }; }), t = totals(views.map(x => x.v));
  const h = await headers(), host = h.get('x-forwarded-host') || h.get('host') || '', proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const link = `${proto}://${host}/a/${e.token}`, ph = waDigits(e.phone).replace(/^0/, '92');
  const waText = `Assalam o Alaikum ${e.name}. This is your Minawa attendance link: ${link}\nOpen it on your own phone in Chrome (iPhone: Safari), press "Register this phone" and touch the fingerprint sensor. After your building manager approves it, check in and out with this link every day from inside the building. Do not share this link.`;
  const back = `/attendance/people/${e.id}${sp.mon ? `?mon=${sp.mon}` : ''}`;
  const myAlerts = alerts.filter(a => a.employeeId === e.id).slice(0, 12);
  const first = new Date(`${mon}-01T00:00:00Z`).getUTCDay();
  return <>
    <div className="proj-head"><PageIc n="user" tone="teal" /><div><div className="eyebrow-b">{e.empNo} · {e.designation}{role !== 'field' && ROLE_WORD[role] !== e.designation ? ` · ${ROLE_WORD[role]}` : ''}</div><div className="proj-title">{e.name}</div></div><div className="crumb-path">Attendance<span>/</span>Employees<span>/</span>{e.name}</div></div>
    {!e.active ? <div className="strip" data-tone="red"><IcTile n="ban" tone="red" /><div className="strip-t"><b>Attendance link switched off</b><span>{e.leftOn ? `since ${fd(e.leftOn)}` : ''} · the link no longer works</span></div></div> : null}
    <div className="grid2">
      <div className="card"><div className="card-row"><h3 data-hic="user" data-tone="teal">Details</h3>{admin ? <Go href={`${back}${back.includes('?') ? '&' : '?'}m=edit`} className="btn sm"><Ic n="edit" s={14} /> Edit</Go> : null}</div>
        <div className="list">
          <div className="li"><div className="t"><div className="a">Mobile</div><div className="b num">{e.phone}</div></div></div>
          {e.fatherName ? <div className="li"><div className="t"><div className="a">Father&apos;s name</div><div className="b">{e.fatherName}</div></div></div> : null}
          <div className="li"><div className="t"><div className="a">CNIC</div><div className="b num">{e.cnic || 'not on file'}</div></div></div>
          <div className="li"><div className="t"><div className="a">Buildings</div><div className="b">{e.projects.map(p => pname(c, p)).join(', ')}</div></div></div>
          <div className="li"><div className="t"><div className="a">Working hours</div><div className="b">{shiftText(e)} · {grace} min grace</div></div></div>
          <div className="li"><div className="t"><div className="a">Weekly off</div><div className="b">{offText(e)}</div></div></div>
          {e.joined ? <div className="li"><div className="t"><div className="a">Joined</div><div className="b">{fd(e.joined)}</div></div></div> : null}
          {e.staffId ? <div className="li"><div className="t"><div className="a">CRM login</div><div className="b">{c.staff.find(s => s.id === e.staffId)?.name || 'linked'} · alerts about them go to {role === 'manager' ? 'the Accountant and the Admin' : 'the Admin'}</div></div></div> : null}
        </div></div>
      <div className="card"><h3 data-hic="phone" data-tone="amber">Attendance link and phone</h3>
        {admin ? <div className="att-link">
          <code className="att-url">{link}</code>
          <div className="att-link-b"><CopyBtn text={link} />{ph.length >= 11 ? <a className="btn sm" href={`https://wa.me/${ph}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"><Wa inl /> Send on WhatsApp</a> : null}<a className="btn sm" href={link} target="_blank" rel="noopener noreferrer"><Ic n="ext" s={14} /> Open</a></div>
          <p className="cell-sub">Only {e.name} should have this link. It works on one phone: the one registered first and approved.</p></div>
          : <p className="cell-sub">The Admin sends {e.name} their personal attendance link.</p>}
        <div className={`att-phone t-${e.device?.status || 'none'}`}>
          {!e.device ? <p><b>No phone registered yet.</b> {e.name} opens the link on their own phone and presses <i>Register this phone</i>.</p>
            : <p><b>{e.device.kind === 'android' ? 'Minawa Attendance app' : 'Phone'}: {e.device.label}</b> · registered {pkt(e.device.at).slice(0, 10) ? fd(pkt(e.device.at).slice(0, 10)) : ''}<br />{e.device.status === 'approved' ? <>Approved by {e.device.approvedBy}{e.device.approvedAt ? ` on ${fd(pkt(e.device.approvedAt).slice(0, 10))}` : ''}</> : <span className="tag warn">Waiting for approval</span>}</p>}
          {e.device?.status === 'pending' && approver ? <div className="att-req-b"><p className="cell-sub" style={{ flexBasis: '100%' }}>Approve only if you saw {e.name} register it on their own phone.</p>
            <form action={phoneDecisionAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ok" value="1" /><input type="hidden" name="back" value={back} /><Submit className="btn sm primary" pendingText="…">Approve phone</Submit></form>
            <form action={phoneDecisionAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ok" value="0" /><input type="hidden" name="back" value={back} /><Submit className="btn sm" pendingText="…">Refuse</Submit></form></div> : null}
        </div>
        {admin ? <details className="att-tools2"><summary>Link and phone tools</summary>
          {[['resetphone', 'Reset phone', 'For a new or lost phone: removes the registered phone; they register again from the same link.', !!e.device],
            ['newlink', 'Make a new link', 'The old link stops working at once (if it was shared by mistake). Send them the new one.', true],
            [e.active ? 'off' : 'on', e.active ? 'Switch the link off' : 'Switch the link on', e.active ? 'For someone who left: their link stops working and they leave the lists.' : 'They can check in again with the same link and phone.', true]]
            .filter(x => x[3]).map(([w, l, why]) => <form key={String(w)} action={employeeStateAction} className="att-tool"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="what" value={String(w)} /><Submit className="btn sm" pendingText="…">{String(l)}</Submit><span className="cell-sub">{String(why)}</span></form>)}
        </details> : null}
      </div>
    </div>
    <div className="card"><div className="card-row"><h3 data-hic="cal" data-tone="teal">{MONL[+mon.slice(5) - 1]} {mon.slice(0, 4)} <small>{t.present + t.half + t.late} at work · {t.late} late · {t.absent} absent · {t.leave} on leave</small></h3>
      <div className="att-mon-nav"><Go href={`/attendance/people/${e.id}?mon=${addMonths(mon, -1)}`} className="btn sm" replace>‹ {MONL[+addMonths(mon, -1).slice(5) - 1].slice(0, 3)}</Go>{mon < c.today.slice(0, 7) ? <Go href={`/attendance/people/${e.id}?mon=${addMonths(mon, 1)}`} className="btn sm" replace>{MONL[+addMonths(mon, 1).slice(5) - 1].slice(0, 3)} ›</Go> : null}</div></div>
      <div className="att-cal" role="grid" aria-label={`${MONL[+mon.slice(5) - 1]} attendance`}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i} className="att-cal-h">{x}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={'b' + i} className="att-cal-x" />)}
        {Array.from({ length: n }, (_, i) => { const d = `${mon}-${String(i + 1).padStart(2, '0')}`, x = views.find(y => y.d === d); return <span key={d} className={`att-cal-d t-${x ? x.v.key : 'future'}`} title={x ? `${fds(d)}: ${x.v.label}${x.r?.inAt ? ` · ${inOut(x.r)}` : ''}` : fds(d)}><b>{i + 1}</b><small>{x ? (x.v.key === 'present' ? 'P' : x.v.key === 'late' ? 'L' : x.v.key === 'absent' ? 'A' : x.v.key === 'leave' ? 'Lv' : x.v.key === 'off' ? 'Off' : x.v.key === 'half' ? 'H' : x.v.key === 'notmarked' ? '?' : '') : ''}</small></span>; })}
      </div>
      <div className="tbl-wrap"><table className="att-tbl"><thead><tr><th>Day</th><th>Status</th><th>In – out</th><th>Where / how</th></tr></thead><tbody>
        {views.filter(x => x.v.key !== 'before').map(x => <tr key={x.d}>
          <td data-l="Day" style={{ whiteSpace: 'nowrap' }}><b>{dow(x.d)} {fds(x.d)}</b></td>
          <td data-l="Status">{statusTag(x.v)}</td>
          <td data-l="In – out" className="num" style={{ whiteSpace: 'nowrap' }}>{inOut(x.r) || <span className="cell-sub">—</span>}</td>
          <td data-l="Where / how"><span className="cell-sub">{howText(x.r)}</span>{x.r?.inPlace ? <> · <a href={mapsLink(x.r.inPlace)} target="_blank" rel="noopener noreferrer" className="cell-sub">map</a></> : null}{x.r?.note ? <div className="cell-sub">“{x.r.note}”</div> : null}</td>
        </tr>)}
      </tbody></table></div>
      {approver ? <details className="att-mark" open={sp.m === 'mark'}><summary><Ic n="edit" s={14} /> Mark a day by hand</summary>
        <p className="cell-sub">For someone without a phone, on leave, or to correct a day. It shows as &quot;marked by {me.name}&quot;.</p>
        <MarkDayForm e={e} d={c.today} rec={views.find(x => x.d === c.today)?.r || null} back={back} /></details> : null}
    </div>
    {myAlerts.length ? <div className="card"><h3 data-hic="alert" data-tone="red">Alerts this month</h3><div className="list">{myAlerts.map(a => <div className="li" key={a.id}><div className="t"><div className="a">{a.kind === 'early_out' ? 'Left before the shift ended' : a.kind === 'left' ? 'Left the office area' : a.kind === 'back' ? 'Back in the area' : 'Location off'} · {fds(a.d)} {pkt(a.at).slice(11)}</div><div className="b">{a.text}{a.place ? <> · <a href={mapsLink(a.place)} target="_blank" rel="noopener noreferrer">{distText(a.place.dist)} away (map)</a></> : null}</div></div></div>)}</div></div> : null}
    {admin && sp.m === 'edit' ? <ModalShell title={`Edit ${e.name}`} wide><EmployeeForm e={e} staff={c.staff} projects={c.projects} emps={c.employees} back={back} /></ModalShell> : null}
  </>;
}
