// Employees (23 Nov 2026): everyone whose attendance is kept, with their phone's state. The Admin adds employees here
// (field staff, or a building manager / accountant linked to their login); each gets a personal attendance link.
import { requireStaff, roleName } from '@/lib/session';
import { attCtx, canSee, pname, shiftText, offText, roleOf, ROLE_WORD } from '@/lib/attendance';
import { EmployeeForm } from '@/components/views/att';
import { Go, GoRow, ModalShell } from '@/components/client';
import { PageIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function People({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), c = await attCtx(), admin = me.role === 'admin';
  const q = (sp.q || '').trim().toLowerCase(), off = sp.v === 'off';
  const vis = c.employees.filter(e => canSee(me, e, c.staff));
  const list = vis.filter(e => e.active !== off).filter(e => !q || `${e.name} ${e.empNo} ${e.designation} ${e.phone} ${e.projects.map(p => pname(c, p)).join(' ')}`.toLowerCase().includes(q));
  const phoneTag = (e: typeof list[number]) => !e.device ? <span className="tag warn">No phone yet</span> : e.device.status === 'pending' ? <span className="tag warn">Phone to approve</span> : <span className="tag good">{e.device.kind === 'android' ? 'App' : 'Phone'} ready</span>;
  return <>
    <div className="proj-head"><PageIc n="users" tone="teal" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Employees</div></div><div className="crumb-path">Attendance<span>/</span>Employees</div></div>
    <div className="card">
      <div className="toolbar cus-tools">
        <div className="ptabs" role="tablist">
          <Go href="/attendance/people" current={!off ? 'true' : 'false'} replace>Working <span className="tab-new">{vis.filter(e => e.active).length}</span></Go>
          <Go href="/attendance/people?v=off" current={off ? 'true' : 'false'} replace>Switched off <span className="tab-new">{vis.filter(e => !e.active).length}</span></Go>
        </div>
        <form method="get" action="/attendance/people" className="cus-form">{off ? <input type="hidden" name="v" value="off" /> : null}<input type="search" name="q" defaultValue={sp.q || ''} placeholder="Name, EMP ID, designation, building" aria-label="Search employees" /><button type="submit" className="btn sm"><Ic n="search" s={15} /> Search</button></form>
        {admin ? <Go href="/attendance/people?m=add" className="btn sm primary"><Ic n="plus" s={14} /> Add employee</Go> : null}
      </div>
      {list.length ? <div className="tbl-wrap"><table className="att-tbl"><thead><tr><th>Employee</th><th>Designation</th><th>Buildings</th><th>Working hours</th><th>Attendance link</th></tr></thead><tbody>
        {list.map(e => <GoRow key={e.id} href={`/attendance/people/${e.id}`} className="row-link">
          <td data-l="Employee"><b>{e.name}</b><div className="cell-sub num">{e.empNo} · {e.phone}</div></td>
          <td data-l="Designation">{e.designation}{roleOf(e, c.staff) !== 'field' ? <div className="cell-sub">has a {ROLE_WORD[roleOf(e, c.staff)]} login</div> : null}</td>
          <td data-l="Buildings">{e.projects.map(p => pname(c, p)).join(', ')}</td>
          <td data-l="Working hours" style={{ whiteSpace: 'nowrap' }}>{shiftText(e)}<div className="cell-sub">off: {offText(e)}</div></td>
          <td data-l="Attendance link">{e.active ? phoneTag(e) : <span className="tag">Switched off</span>}</td>
        </GoRow>)}
      </tbody></table></div> : <Empty kind="search" small title={q ? `No employee matches "${sp.q}"` : off ? 'Nobody switched off' : 'No employees yet'}>{admin && !q && !off ? 'Add your staff with Add employee: each gets a personal attendance link to send them.' : null}</Empty>}
    </div>
    {admin && sp.m === 'add' ? <ModalShell title="Add employee" wide><EmployeeForm staff={c.staff} projects={c.projects} emps={c.employees} back="/attendance/people" /></ModalShell> : null}
  </>;
}
