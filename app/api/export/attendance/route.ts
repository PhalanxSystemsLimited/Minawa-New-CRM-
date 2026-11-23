// Attendance month sheet as Excel (23 Nov 2026): everyone the person may see (a building, or all theirs) × the days of
// the month, with totals, and a sheet with every check-in and check-out (times, distance from the office, how).
import { currentStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { attCtx, canSee, dayView, graceOf, pname, totals, distText, shiftText, STATUS_LABEL, LETTER } from '@/lib/attendance';
import { dim, MONL, todayPKT, t12, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), c = await attCtx(), pid = u.searchParams.get('p') || '';
  const mon = /^\d{4}-\d{2}$/.test(u.searchParams.get('mon') || '') ? u.searchParams.get('mon')! : todayPKT().slice(0, 7), n = dim(+mon.slice(0, 4), +mon.slice(5, 7));
  const vis = c.employees.filter(e => canSee(me, e, c.staff) && (!pid || e.projects.includes(pid)) && (e.active || (e.leftOn || '') >= `${mon}-01`));
  const recs = await (await getStore()).listAttendance({ from: `${mon}-01`, to: `${mon}-${String(n).padStart(2, '0')}`, employeeIds: vis.map(e => e.id) });
  const days = Array.from({ length: n }, (_, i) => `${mon}-${String(i + 1).padStart(2, '0')}`), name = `${MONL[+mon.slice(5) - 1]} ${mon.slice(0, 4)}`;
  const x = new Sheet('Month sheet').title(`Attendance · ${name}`).note(`${pid ? pname(c, pid) : 'All your buildings'} · ${vis.length} employees · P present, L late, H half day, A absent, Lv leave, O off · downloaded by ${me.name}`).blank()
    .head(['EMP ID', 'Name', 'Designation', 'Working hours', ...days.map(d => String(+d.slice(8))), ['Present', 'int'], ['Late', 'int'], ['Absent', 'int'], ['Leave', 'int']]);
  for (const e of vis) {
    const vs = days.map(d => dayView(e, d, recs.find(r => r.employeeId === e.id && r.d === d), c.now, graceOf(c, e))), t = totals(vs);
    x.row([e.empNo, e.name, e.designation, shiftText(e), ...vs.map(v => LETTER[v.key] === '·' ? '' : LETTER[v.key] ?? ''), t.present + t.half, t.late, t.absent, t.leave]);
  }
  const y = new Sheet('Check-ins').title(`Check-ins and check-outs · ${name}`).blank().head([['Date', 'date'], 'EMP ID', 'Name', 'Building', 'Status', 'In', 'Out', 'Distance at check-in', 'How', 'Note']);
  for (const r of recs) { const e = vis.find(v => v.id === r.employeeId); if (!e) continue;
    y.row([r.d, e.empNo, e.name, pname(c, r.project), STATUS_LABEL[r.status], r.inAt ? t12(r.inAt.slice(11)) : '', r.outAt ? `${t12(r.outAt.slice(11))}${r.outAt.slice(0, 10) !== r.d ? ` (${fd(r.outAt.slice(0, 10))})` : ''}` : '', r.inPlace ? distText(r.inPlace.dist) : '', r.how === 'manager' ? `by ${r.byName || 'manager'}` : r.how, r.note || '']); }
  return xlsxResponse([x, y], `minawa-attendance-${mon}${pid ? '-' + pid : ''}`);
}
