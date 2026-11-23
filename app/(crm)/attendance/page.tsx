// Attendance (23 Nov 2026). Today: every employee of the person's buildings with their status (checked in, late, not
// marked yet, absent, on leave, off) and times. Month sheet: everyone × the days of a month. Requests: phones and
// "Ask manager" requests waiting for this person. The Admin and accountants see managers too (lib/attendance.ts
// canSee); a building manager sees his field staff.
import { requireStaff, roleName } from '@/lib/session';
import { getStore } from '@/lib/store';
import { attFeed } from '@/lib/att-notify';
import { canSee, canApprove, dayView, graceOf, pname, workDay, shiftText, roleOf, ROLE_WORD, distText, mapsLink, dayWords, totals, type DayView } from '@/lib/attendance';
import { phoneDecisionAction, askDecisionAction } from '@/lib/actions-att';
import { statusTag, howText, inOut, LETTER } from '@/components/views/att';
import { Go, GoRow, Submit } from '@/components/client';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic, IcTile } from '@/components/icons';
import { addDays, dim, dow, fd, fds, MONL, t12, addMonths } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

const FILTERS: [string, string][] = [['', 'Everyone'], ['marked', 'Marked'], ['notmarked', 'Not marked yet'], ['late', 'Late'], ['absent', 'Absent'], ['leave', 'On leave / off']];

export default async function Attendance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), store = await getStore(), f = await attFeed(me), c = f.ctx;
  const mine = c.projects.filter(p => me.role === 'admin' || (me.projects || []).includes(p.id) || (me.role === 'accountant' && !(me.projects || []).length));
  const pid = mine.some(p => p.id === sp.p) ? sp.p! : '', v = sp.v === 'month' || sp.v === 'requests' ? sp.v : 'today';
  const vis = c.employees.filter(e => e.active && canSee(me, e, c.staff) && (!pid || e.projects.some(p => p === pid)) && (pid || e.projects.some(p => mine.some(x => x.id === p)) || e.staffId === me.id));
  const href = (k: Record<string, string>) => { const u = new URLSearchParams(Object.entries({ p: pid, v: v === 'today' ? '' : v, ...k }).filter(([, x]) => x)).toString(); return '/attendance' + (u ? '?' + u : ''); };
  const reqs = f.reqs.filter(r => { const e = c.employees.find(x => x.id === r.employeeId); return e && canApprove(me, e, c.staff); });
  const phones = c.employees.filter(e => e.device?.status === 'pending' && canApprove(me, e, c.staff));
  const waiting = reqs.length + phones.length;
  const head = <>
    <div className="proj-head"><PageIc n="clock" tone="teal" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Attendance</div></div><div className="crumb-path">Dashboard<span>/</span>Attendance</div></div>
    <div className="toolbar att-tools">
      <div className="ptabs" role="tablist">
        <Go href={href({ v: '' })} current={v === 'today' ? 'true' : 'false'} replace>Today</Go>
        <Go href={href({ v: 'month' })} current={v === 'month' ? 'true' : 'false'} replace>Month sheet</Go>
        <Go href={href({ v: 'requests' })} current={v === 'requests' ? 'true' : 'false'} replace>To approve {waiting ? <span className="tab-new">{waiting}</span> : null}</Go>
        <Go href="/attendance/people">Employees</Go>
      </div>
      {mine.length > 1 ? <form method="get" action="/attendance" className="cus-form">{v !== 'today' ? <input type="hidden" name="v" value={v} /> : null}{sp.mon ? <input type="hidden" name="mon" value={sp.mon} /> : null}
        <select name="p" defaultValue={pid} aria-label="Building"><option value="">All my buildings</option>{mine.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button type="submit" className="btn sm">Show</button></form> : null}
    </div></>;
  if (!c.employees.length) return <>{head}<div className="card"><Empty kind="inbox" title="No employees yet">{me.role === 'admin' ? <>Add your staff on <Go href="/attendance/people?m=add">Employees</Go>: each gets a personal attendance link to check in with their fingerprint. Set each building&apos;s office point in its Settings first.</> : 'The Admin adds employees; each gets a personal attendance link to check in with their fingerprint.'}</Empty></div></>;

  /* ---------- requests ---------- */
  if (v === 'requests') {
    const done = (await store.listAttRequests({ since: addDays(c.today, -7) })).filter(r => r.status !== 'pending' && vis.some(e => e.id === r.employeeId)).slice(0, 20);
    const nm = (id: string) => c.employees.find(e => e.id === id);
    return <>{head}
      <div className="card"><h3 data-hic="phone" data-tone="amber">Phones to approve <small>{phones.length ? `${phones.length} waiting` : 'none waiting'}</small></h3>
        {phones.length ? <div className="list">{phones.map(e => <div className="li att-req" key={e.id}><div className="t"><div className="a"><Go href={`/attendance/people/${e.id}`}>{e.name}</Go> · {e.designation} <span className="cell-sub">{e.empNo}</span></div>
          <div className="b">Registered {e.device!.label} on {fd(new Date(Date.parse(e.device!.at) + 5 * 3600e3).toISOString().slice(0, 10))}. Approve only if you saw {e.name} register it on their own phone.</div></div>
          <div className="att-req-b"><form action={phoneDecisionAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ok" value="1" /><input type="hidden" name="back" value={href({})} /><Submit className="btn sm primary" pendingText="…">Approve</Submit></form>
            <form action={phoneDecisionAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ok" value="0" /><input type="hidden" name="back" value={href({})} /><Submit className="btn sm" pendingText="…">Refuse</Submit></form></div></div>)}</div>
          : <p className="cell-sub">When an employee opens their link and registers a phone, it waits here for you.</p>}</div>
      <div className="card"><h3 data-hic="clip" data-tone="blue">&quot;Ask manager&quot; requests <small>{reqs.length ? `${reqs.length} waiting` : 'none waiting'}</small></h3>
        {reqs.length ? <div className="list">{reqs.map(r => { const e = nm(r.employeeId)!; return <div className="li att-req" key={r.id}><div className="t"><div className="a"><Go href={`/attendance/people/${e.id}`}>{e.name}</Go> asks to be marked <b>{r.kind === 'checkin' ? 'checked in' : 'checked out'}</b> at {t12(r.t)} · {dayWords(r.d)}</div>
          <div className="b">{r.reason}{r.place ? <> · <a href={mapsLink(r.place)} target="_blank" rel="noopener noreferrer">where the phone was ({distText(r.place.dist)} away)</a></> : null}</div></div>
          <div className="att-req-b"><form action={askDecisionAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="ok" value="1" /><Submit className="btn sm primary" pendingText="…">Approve</Submit></form>
            <form action={askDecisionAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="ok" value="0" /><Submit className="btn sm" pendingText="…">Refuse</Submit></form></div></div>; })}</div>
          : <p className="cell-sub">If a check-in is refused (outside the area, location not accurate), the employee can ask you to mark them. Requests wait here.</p>}
        {done.length ? <><h4 style={{ margin: '14px 0 6px' }}>Decided in the last 7 days</h4><div className="list">{done.map(r => <div className="li" key={r.id}><div className="t"><div className="a">{nm(r.employeeId)?.name} · {r.kind === 'checkin' ? 'check-in' : 'check-out'} {t12(r.t)}, {fds(r.d)}</div><div className="b">{r.status === 'approved' ? 'Approved' : 'Refused'} by {r.decidedBy}</div></div></div>)}</div></> : null}
      </div></>;
  }

  /* ---------- month sheet ---------- */
  if (v === 'month') {
    const mon = /^\d{4}-\d{2}$/.test(sp.mon || '') && sp.mon! <= c.today.slice(0, 7) ? sp.mon! : c.today.slice(0, 7), n = dim(+mon.slice(0, 4), +mon.slice(5, 7));
    const recs = await store.listAttendance({ from: `${mon}-01`, to: `${mon}-${String(n).padStart(2, '0')}`, employeeIds: vis.map(e => e.id) });
    const days = Array.from({ length: n }, (_, i) => `${mon}-${String(i + 1).padStart(2, '0')}`);
    const rows = vis.map(e => { const vs = days.map(d => dayView(e, d, recs.find(r => r.employeeId === e.id && r.d === d), c.now, graceOf(c, e))); return { e, vs, t: totals(vs) }; });
    return <>{head}
      <div className="card"><div className="card-row"><h3 data-hic="cal" data-tone="teal">{MONL[+mon.slice(5) - 1]} {mon.slice(0, 4)} <small>{vis.length} employee{vis.length === 1 ? '' : 's'}{pid ? ` · ${pname(c, pid)}` : ''}</small></h3>
        <div className="att-mon-nav"><Go href={href({ v: 'month', mon: addMonths(mon, -1) })} className="btn sm">‹ {MONL[+addMonths(mon, -1).slice(5) - 1].slice(0, 3)}</Go>{mon < c.today.slice(0, 7) ? <Go href={href({ v: 'month', mon: addMonths(mon, 1) })} className="btn sm">{MONL[+addMonths(mon, 1).slice(5) - 1].slice(0, 3)} ›</Go> : null}
          <a className="btn sm" href={`/api/export/attendance?${new URLSearchParams(Object.entries({ p: pid, mon }).filter(([, x]) => x))}`}><Ic n="download" s={14} /> Excel</a></div></div>
        <div className="tbl-wrap att-sheet-wrap" data-nocap><table className="att-sheet m-keep"><thead><tr><th className="att-sh-n">Employee</th>{days.map(d => <th key={d} className={dow(d) === 'Sun' ? 'sun' : ''}><span>{+d.slice(8)}</span><small>{dow(d).slice(0, 2)}</small></th>)}<th className="r">P</th><th className="r">L</th><th className="r">A</th><th className="r">Lv</th></tr></thead><tbody>
          {rows.map(({ e, vs, t }) => <tr key={e.id}><td className="att-sh-n"><Go href={`/attendance/people/${e.id}?mon=${mon}`}><b>{e.name}</b></Go><div className="cell-sub">{e.designation}</div></td>
            {vs.map((x, i) => <td key={i} className={`att-c t-${x.key}`} title={`${fds(days[i])}: ${x.label || '—'}`}>{LETTER[x.key] ?? ''}</td>)}
            <td className="r num">{t.present + t.half}</td><td className="r num">{t.late}</td><td className="r num">{t.absent}</td><td className="r num">{t.leave}</td></tr>)}
        </tbody></table></div>
        <p className="cell-sub att-key">P present · L late · H half day · A absent · Lv on leave · O off · <span className="att-c t-notmarked">·</span> not marked yet. Totals: P counts present and half days; L late; A absent; Lv leave. Click a name for their days and times.</p>
      </div></>;
  }

  /* ---------- today ---------- */
  const rows = vis.map(e => { const day = workDay(e, c.today, c.now.slice(11)), rec = f.recs.find(r => r.employeeId === e.id && r.d === day) || null; return { e, day, rec, view: dayView(e, day, rec, c.now, graceOf(c, e)) }; });
  const k = (fn: (x: DayView) => boolean) => rows.filter(r => fn(r.view)).length;
  const marked = k(x => x.marked), late = k(x => x.key === 'late'), notm = k(x => x.key === 'notmarked'), absent = k(x => x.key === 'absent'), lv = k(x => x.key === 'leave' || x.key === 'off'), wait = k(x => x.key === 'waiting');
  const fl = sp.f || '', match = (r: typeof rows[number]) => !fl || (fl === 'marked' ? r.view.marked : fl === 'notmarked' ? r.view.key === 'notmarked' || r.view.key === 'waiting' : fl === 'leave' ? r.view.key === 'leave' || r.view.key === 'off' : r.view.key === fl);
  const order: Record<string, number> = { notmarked: 0, late: 1, absent: 2, present: 3, half: 3, waiting: 4, leave: 5, off: 6 };
  const list = rows.filter(match).sort((a, b) => (order[a.view.key] ?? 9) - (order[b.view.key] ?? 9) || (a.rec?.inAt || '').localeCompare(b.rec?.inAt || '') || a.e.name.localeCompare(b.e.name));
  return <>{head}
    {waiting ? <div className="strip" data-tone="amber"><IcTile n="alert" tone="amber" /><div className="strip-t"><b>{waiting} waiting for you</b><span>{phones.length ? `${phones.length} phone${phones.length === 1 ? '' : 's'} to approve` : ''}{phones.length && reqs.length ? ' · ' : ''}{reqs.length ? `${reqs.length} "Ask manager" request${reqs.length === 1 ? '' : 's'}` : ''}</span></div><Go href={href({ v: 'requests' })} className="btn sm primary">Open</Go></div> : null}
    <div className="kpis">
      <div className="kpi"><KIc n="calok" tone="green" /><div className="l">Marked today</div><div className="v num">{marked}<small> / {rows.length}</small></div><div className="cell-sub">{late} late</div></div>
      <div className="kpi"><KIc n="hourglass" tone="amber" /><div className="l">Not marked yet</div><div className="v num">{notm}</div><div className="cell-sub">{wait ? `+ ${wait} whose shift hasn't started` : 'past their grace time'}</div></div>
      <div className="kpi"><KIc n="ban" tone="red" /><div className="l">Absent</div><div className="v num">{absent}</div><div className="cell-sub">shift over, not marked</div></div>
      <div className="kpi"><KIc n="cal" tone="blue" /><div className="l">On leave or off</div><div className="v num">{lv}</div><div className="cell-sub">{dow(c.today)} {fd(c.today)}</div></div>
    </div>
    <div className="card">
      <div className="toolbar"><div className="att-chips" role="group" aria-label="Show">{FILTERS.map(([val, l]) => <Go key={val} href={href({ f: val })} className={'chipbtn' + (fl === val ? ' on' : '')} replace>{l}</Go>)}</div><span className="cell-sub">Live: updates as people check in · {t12(c.now.slice(11))}</span></div>
      {list.length ? <div className="tbl-wrap"><table className="att-tbl"><thead><tr><th>Employee</th>{pid ? null : <th>Building</th>}<th>Working hours</th><th>Today</th><th>In – out</th><th>How</th></tr></thead><tbody>
        {list.map(({ e, rec, view }) => <GoRow key={e.id} href={`/attendance/people/${e.id}`} className="row-link">
          <td data-l="Employee"><b>{e.name}</b>{e.staffId === me.id ? <span className="tag info" style={{ marginLeft: 6 }}>You</span> : null}<div className="cell-sub">{e.empNo} · {e.designation}{roleOf(e, c.staff) !== 'field' && ROLE_WORD[roleOf(e, c.staff)] !== e.designation ? ` · ${ROLE_WORD[roleOf(e, c.staff)]}` : ''}</div></td>
          {pid ? null : <td data-l="Building">{rec ? pname(c, rec.project) : e.projects.map(p => pname(c, p)).join(', ')}</td>}
          <td data-l="Working hours" style={{ whiteSpace: 'nowrap' }}>{shiftText(e)}</td>
          <td data-l="Today">{statusTag(view)}{!e.device ? <div className="cell-sub">no phone registered</div> : e.device.status === 'pending' ? <div className="cell-sub">phone waiting for approval</div> : null}</td>
          <td data-l="In – out" className="num" style={{ whiteSpace: 'nowrap' }}>{inOut(rec) || <span className="cell-sub">—</span>}</td>
          <td data-l="How"><span className="cell-sub">{howText(rec)}</span></td>
        </GoRow>)}
      </tbody></table></div> : <Empty kind="search" small title="Nobody here">{fl ? 'No one matches this filter.' : 'No employees in this building yet.'}</Empty>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>Click a name for their month, to mark a day by hand (no phone, leave, a correction) or to approve their phone.</p>
    </div></>;
}
