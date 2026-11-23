// The dashboard's "Attendance today" card (23 Nov 2026): the person's staff with who has checked in and who hasn't
// yet, and how many attendance notifications are new (cleared when the Attendance screen is opened).
import type { Staff } from '@/lib/types';
import { attFeed } from '@/lib/att-notify';
import { canSee, dayView, graceOf, pname, workDay } from '@/lib/attendance';
import { statusTag, inOut } from './att';
import { Go, GoRow } from '@/components/client';
import { Ic, IcTile } from '@/components/icons';
import { Lbl } from './live';

export async function AttTodayCard({ staff }: { staff: Staff }) {
  let f; try { f = await attFeed(staff); } catch { return null; }
  const c = f.ctx, vis = c.employees.filter(e => e.active && canSee(staff, e, c.staff));
  if (!vis.length) return staff.role === 'admin' && !c.employees.length ? <div className="strip" data-tone="teal"><IcTile n="clock" tone="teal" /><div className="strip-t"><b>Attendance with fingerprints</b><span>Add your staff on Attendance › Employees; each gets a personal link to check in from inside the building.</span></div><Go href="/attendance/people?m=add" className="btn sm primary">Add employees</Go></div> : null;
  const rows = vis.map(e => { const day = workDay(e, c.today, c.now.slice(11)), rec = f.recs.find(r => r.employeeId === e.id && r.d === day) || null; return { e, rec, v: dayView(e, day, rec, c.now, graceOf(c, e)) }; });
  const n = (fn: (r: typeof rows[number]) => boolean) => rows.filter(fn).length;
  const marked = n(r => r.v.marked), notm = n(r => r.v.key === 'notmarked'), late = n(r => r.v.key === 'late'), absent = n(r => r.v.key === 'absent'), lv = n(r => r.v.key === 'leave' || r.v.key === 'off');
  const order: Record<string, number> = { notmarked: 0, absent: 1, late: 2, present: 3, half: 3, waiting: 4, leave: 5, off: 6 };
  const top = [...rows].sort((a, b) => (order[a.v.key] ?? 9) - (order[b.v.key] ?? 9) || a.e.name.localeCompare(b.e.name)).slice(0, 8);
  return <><Lbl>Attendance today</Lbl>
    <div className="card att-dash">
      <div className="card-row"><div className="att-dash-k">
        <span className="att-k good"><b className="num">{marked}<small>/{rows.length}</small></b> marked</span>
        <span className={`att-k ${notm ? 'warn' : ''}`}><b className="num">{notm}</b> not marked yet</span>
        <span className={`att-k ${late ? 'warn' : ''}`}><b className="num">{late}</b> late</span>
        <span className={`att-k ${absent ? 'bad' : ''}`}><b className="num">{absent}</b> absent</span>
        <span className="att-k"><b className="num">{lv}</b> on leave / off</span></div>
        <Go href="/attendance" className="btn sm primary">{f.unseen ? <><span className="att-new">{f.unseen} new</span> Open Attendance</> : 'Open Attendance'}</Go></div>
      <div className="tbl-wrap"><table className="att-tbl att-mini"><tbody>
        {top.map(({ e, rec, v }) => <GoRow key={e.id} href={`/attendance/people/${e.id}`} className="row-link">
          <td data-l="Employee"><b>{e.name}</b><div className="cell-sub">{e.designation}{c.projects.length > 1 ? ` · ${pname(c, rec?.project || e.projects[0])}` : ''}</div></td>
          <td data-l="Today">{statusTag(v)}</td>
          <td data-l="In – out" className="num r" style={{ whiteSpace: 'nowrap' }}>{inOut(rec) || <span className="cell-sub">—</span>}</td>
        </GoRow>)}
      </tbody></table></div>
      {rows.length > top.length ? <p className="cell-sub" style={{ margin: '8px 0 0' }}>{rows.length - top.length} more on <Go href="/attendance">Attendance</Go>.</p> : null}
    </div></>;
}
