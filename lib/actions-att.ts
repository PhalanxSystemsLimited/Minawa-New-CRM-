'use server';
// Attendance actions (23 Nov 2026).
//  · The Admin adds and edits employees (their buildings, working hours, weekly off days), switches a link off or on,
//    makes a new link (the old one stops at once) and resets the registered phone.
//  · The building manager approves or refuses a field employee's phone and "Ask manager" requests, and marks the day
//    by hand (staff without a phone, leave, corrections). The Admin can do this for everyone.
//  · The Admin sets each building's office point, radius, accuracy limit and grace minutes.
import { redirect } from 'next/navigation';
import { requireStaff, requireAdmin, staffName } from './session';
import { getStore } from './store';
import { normCnic, staffNos } from './people';
import { DESIGNATIONS, attCtx, canApprove, nextEmpNo, newToken, parsePoint, attLog, mins, minsLate, workDay, attSettings, STATUS_LABEL, dayWords, roleOf } from './attendance';
import { t12, todayPKT, addDays } from './fmt';
import type { Employee, AttRecord, AttStatus } from './types';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (fd: FormData, fallback: string, msg: string): never => {
  const b = S(fd, 'back'), to = /^\/(attendance|p\/)/.test(b) && !b.startsWith('//') ? b : fallback;
  redirect(`${to}${to.includes('?') ? '&' : '?'}t=${encodeURIComponent(msg)}`);
};
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const hhmm = (v: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };

/** Add or edit an employee (Admin). */
export async function saveEmployeeAction(fd: FormData) {
  const me = await requireAdmin(), store = await getStore(), id = S(fd, 'id');
  let msg = '', to = '/attendance/people';
  try {
    const [emps, staff, projects] = await Promise.all([store.listEmployees(), store.listStaff(), store.listProjects()]);
    const old = id ? emps.find(e => e.id === id) : null;
    if (id && !old) throw new Error('That employee is not on file');
    const staffId = S(fd, 'staffId') || null, login = staffId ? staff.find(s => s.id === staffId) : null;
    if (staffId && !login) throw new Error('That login is not on file');
    if (staffId && emps.some(e => e.staffId === staffId && e.id !== id)) throw new Error(`${login!.name} already has an attendance record`);
    const name = S(fd, 'name') || login?.name || '', phone = S(fd, 'phone') || login?.phone || '', designation = S(fd, 'designation') || (login ? (login.role === 'manager' ? 'Building manager' : login.role === 'accountant' ? 'Accountant' : '') : '');
    if (name.length < 2) throw new Error('Write the employee\'s full name');
    if (phone.replace(/\D/g, '').length < 10) throw new Error('Write a mobile number (at least 10 digits)');
    if (!designation) throw new Error('Choose the designation');
    if (!DESIGNATIONS.includes(designation) && designation.length > 40) throw new Error('The designation is too long');
    const pids = fd.getAll('projects').map(String).filter(p => projects.some(x => x.id === p));
    if (!pids.length) throw new Error('Tick at least one building they work at');
    const ss = hhmm(S(fd, 'shiftStart')), se = hhmm(S(fd, 'shiftEnd'));
    if (!TIME.test(ss) || !TIME.test(se)) throw new Error('Set the working hours (start and end time)');
    if (ss === se) throw new Error('The shift can\'t start and end at the same time');
    const off = [...new Set(fd.getAll('offDays').map(Number).filter(n => n >= 0 && n <= 6))].sort();
    if (off.length > 5) throw new Error('At most 5 weekly off days');
    const cnicIn = S(fd, 'cnic'), cnic = cnicIn ? normCnic(cnicIn) : null;
    if (cnicIn && !cnic) throw new Error('The CNIC should have 13 digits (12345-1234567-1)');
    const joined = /^\d{4}-\d{2}-\d{2}$/.test(S(fd, 'joined')) ? S(fd, 'joined') : null;
    const loginNo = login ? staffNos(staff).map.get(login.id) || null : null;
    const e: Employee = old ? { ...old } : {
      id: `EM${Date.now().toString(36).toUpperCase()}`, empNo: loginNo && !emps.some(x => x.empNo === loginNo) ? loginNo : nextEmpNo(emps, staff), name, fatherName: null, phone, cnic: null,
      designation, projects: pids, staffId, shiftStart: ss, shiftEnd: se, offDays: off, active: true, joined, leftOn: null, token: newToken(), device: null, createdBy: staffName(me)
    };
    Object.assign(e, { name, fatherName: S(fd, 'fatherName') || null, phone, cnic, designation, projects: pids, staffId, shiftStart: ss, shiftEnd: se, offDays: off, joined });
    await store.saveEmployee(e);
    const where = pids.map(p => projects.find(x => x.id === p)?.name || p).join(', ');
    await attLog(pids[0], old ? `Employee ${e.name} (${e.empNo}) changed by ${staffName(me)}: ${designation}, ${where}, ${t12(ss)}–${t12(se)}` : `Employee ${e.name} (${e.empNo}) added by ${staffName(me)}: ${designation}, ${where}, ${t12(ss)}–${t12(se)}`, me);
    msg = old ? `${e.name}'s details saved` : `${e.name} added as ${e.empNo}. Copy their attendance link below and send it to them.`;
    to = `/attendance/people/${e.id}`;
  } catch (x) { redirect(`${id ? `/attendance/people/${id}?m=edit` : '/attendance/people?m=add'}&t=${encodeURIComponent(`Not saved: ${(x as Error).message}`)}`); }
  redirect(`${to}?t=${encodeURIComponent(msg)}`);
}

/** Switch a link off / on, make a new link, or reset the phone (Admin). */
export async function employeeStateAction(fd: FormData) {
  const me = await requireAdmin(), store = await getStore(), id = S(fd, 'id'), what = S(fd, 'what');
  const e = (await store.listEmployees()).find(x => x.id === id);
  if (!e) go(fd, '/attendance/people', 'Not saved: that employee is not on file');
  const x = e!, who = staffName(me);
  let msg = '';
  if (what === 'off') { x.active = false; x.leftOn = todayPKT(); msg = `${x.name}'s attendance link is switched off`; }
  else if (what === 'on') { x.active = true; x.leftOn = null; msg = `${x.name}'s attendance link is on again`; }
  else if (what === 'newlink') { x.token = newToken(); msg = `New link made for ${x.name}: the old one no longer works. Copy and send the new one.`; }
  else if (what === 'resetphone') { x.device = null; msg = `${x.name}'s phone was removed: they register again by opening their link`; }
  else go(fd, `/attendance/people/${id}`, 'Not saved: unknown change');
  await store.saveEmployee(x);
  await attLog(x.projects[0] || null, `${msg} (by ${who})`, me);
  go(fd, `/attendance/people/${id}`, msg);
}

/** Approve or refuse a registered phone (building manager for field staff; Admin for everyone). */
export async function phoneDecisionAction(fd: FormData) {
  const me = await requireStaff(), store = await getStore(), id = S(fd, 'id'), ok = S(fd, 'ok') === '1';
  const [emps, staff] = await Promise.all([store.listEmployees(), store.listStaff()]), e = emps.find(x => x.id === id);
  if (!e || !e.device) go(fd, '/attendance', 'Not saved: no phone waiting for this employee');
  if (!canApprove(me, e!, staff)) go(fd, '/attendance', 'Not saved: only their building manager or the Admin can approve this phone');
  const x = e!, label = x.device!.label;
  if (ok) x.device = { ...x.device!, status: 'approved', approvedBy: staffName(me), approvedAt: new Date().toISOString() }; else x.device = null;
  await store.saveEmployee(x);
  await attLog(x.projects[0] || null, `${x.name}'s phone (${label}) ${ok ? 'approved' : 'refused'} by ${staffName(me)}`, me);
  go(fd, `/attendance/people/${id}`, ok ? `${x.name}'s phone approved: they can check in now` : `Phone refused and removed: ${x.name} can register again from their link`);
}

/** Approve or refuse an "Ask manager" request. Approved: marked by hand at the time of the request. */
export async function askDecisionAction(fd: FormData) {
  const me = await requireStaff(), store = await getStore(), id = S(fd, 'id'), ok = S(fd, 'ok') === '1';
  const [reqs, c] = await Promise.all([store.listAttRequests({ status: 'pending' }), attCtx()]), r = reqs.find(x => x.id === id), e = r && c.employees.find(x => x.id === r.employeeId);
  if (!r || !e) go(fd, '/attendance?v=requests', 'Not saved: that request is no longer waiting');
  if (!canApprove(me, e!, c.staff)) go(fd, '/attendance?v=requests', 'Not saved: only their building manager or the Admin can decide this');
  const q = r!, emp = e!, who = staffName(me);
  if (ok) {
    const day = workDay(emp, q.d, q.t), have = (await store.listAttendance({ from: day, to: day, employeeIds: [emp.id] }))[0];
    const at = `${q.d} ${q.t}`, late = minsLate(emp, day, q.d, q.t) > (c.settings[emp.projects[0]]?.grace ?? 15);
    const rec: AttRecord = q.kind === 'checkin'
      ? { ...(have || {}), id: `${emp.id}:${day}`, employeeId: emp.id, project: q.project, d: day, status: late ? 'late' : 'present', inAt: at, outAt: have?.outAt || null, inPlace: q.place, outPlace: have?.outPlace || null, how: 'manager', byName: who, note: have?.note || null }
      : { ...(have || { id: `${emp.id}:${day}`, employeeId: emp.id, project: q.project, d: day, status: 'present', inAt: null, inPlace: null, note: null }), outAt: at, outPlace: q.place, how: 'manager', byName: who } as AttRecord;
    await store.saveAttendance(rec);
  }
  await store.saveAttRequest({ ...q, status: ok ? 'approved' : 'refused', decidedBy: who, decidedAt: new Date().toISOString() });
  await attLog(q.project, `${emp.name}'s request to mark ${q.kind === 'checkin' ? 'check-in' : 'check-out'} at ${t12(q.t)} on ${dayWords(q.d)} ${ok ? 'approved' : 'refused'} by ${who}`, me);
  go(fd, '/attendance?v=requests', ok ? `${emp.name} marked: ${q.kind === 'checkin' ? 'checked in' : 'checked out'} at ${t12(q.t)}` : `Request refused`);
}

/** Mark a day by hand (building manager for his field staff; Admin for everyone): present, late, half day, absent,
 *  on leave or off, with the times if known. "clear" removes a hand mark (the day goes back to what the data says). */
export async function markDayAction(fd: FormData) {
  const me = await requireStaff(), store = await getStore(), c = await attCtx(), id = S(fd, 'id'), d = S(fd, 'd'), st = S(fd, 'status');
  const e = c.employees.find(x => x.id === id);
  const fallback = `/attendance/people/${id}?mon=${d.slice(0, 7)}`;
  if (!e) go(fd, '/attendance', 'Not saved: that employee is not on file');
  if (!canApprove(me, e!, c.staff)) go(fd, fallback, `Not saved: only ${roleOf(e!, c.staff) === 'field' ? 'their building manager or ' : ''}the Admin can mark ${e!.name}'s attendance`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > c.today || d < addDays(c.today, -62)) go(fd, fallback, 'Not saved: choose a day in the last two months');
  const emp = e!, who = staffName(me), have = (await store.listAttendance({ from: d, to: d, employeeIds: [emp.id] }))[0];
  if (!(st in STATUS_LABEL)) go(fd, fallback, 'Not saved: choose what to mark');
  const tin = hhmm(S(fd, 'in')), tout = hhmm(S(fd, 'out')), worked = ['present', 'late', 'half'].includes(st);
  if (worked && tin && !TIME.test(tin)) go(fd, fallback, 'Not saved: the check-in time should look like 09:00');
  if (worked && tout && !TIME.test(tout)) go(fd, fallback, 'Not saved: the check-out time should look like 17:00');
  const outDay = tout && tin && mins(tout) <= mins(tin) ? addDays(d, 1) : d;
  const rec: AttRecord = {
    id: `${emp.id}:${d}`, employeeId: emp.id, project: have?.project || emp.projects[0], d, status: st as AttStatus,
    inAt: worked ? (tin ? `${d} ${tin}` : have?.inAt || null) : null, outAt: worked ? (tout ? `${outDay} ${tout}` : have?.outAt || null) : null,
    inPlace: worked ? have?.inPlace || null : null, outPlace: worked ? have?.outPlace || null : null,
    how: 'manager', byName: who, note: S(fd, 'note').slice(0, 200) || null
  };
  await store.saveAttendance(rec);
  await attLog(rec.project, `${emp.name} marked ${STATUS_LABEL[rec.status].toLowerCase()} for ${dayWords(d)}${rec.inAt ? ` (in ${t12(rec.inAt.slice(11))}${rec.outAt ? `, out ${t12(rec.outAt.slice(11))}` : ''})` : ''} by ${who}${rec.note ? `: ${rec.note}` : ''}`, me);
  go(fd, fallback, `${emp.name}: ${STATUS_LABEL[rec.status]} on ${dayWords(d)}`);
}

/** A building's office point, radius, accuracy limit and grace minutes (Admin). */
export async function attSettingsAction(fd: FormData) {
  const me = await requireAdmin(), store = await getStore(), pid = S(fd, 'pid'), back = `/p/${pid}/settings`;
  const p = (await store.listProjects()).find(x => x.id === pid);
  if (!p) go(fd, back, 'Not saved: unknown building');
  const set = await store.getSettings(pid), before = attSettings(set.rules);
  const typed = S(fd, 'point'), lat = Number(S(fd, 'lat')), lng = Number(S(fd, 'lng'));
  let pt = typed ? parsePoint(typed) : null;
  if (!pt && S(fd, 'lat') && Number.isFinite(lat) && Number.isFinite(lng)) pt = { lat, lng };
  if (typed && !pt) go(fd, back, /goo\.gl|maps\.app/.test(typed) ? 'Not saved: short Google Maps links hide the location. Open the link, copy the full address from the browser bar (with @24.8…,67.0…) or the two numbers, and paste that.' : 'Not saved: that is not a location. Paste a full Google Maps link or the two numbers (24.8607, 67.0011).');
  const radius = Math.round(Number(S(fd, 'radius')) || 0), acc = Math.round(Number(S(fd, 'acc')) || 0), grace = Math.round(Number(S(fd, 'grace')));
  if (radius < 20 || radius > 2000) go(fd, back, 'Not saved: the radius should be 20 to 2,000 metres');
  if (acc < 10 || acc > 500) go(fd, back, 'Not saved: the accuracy limit should be 10 to 500 metres');
  if (!Number.isFinite(grace) || grace < 0 || grace > 180) go(fd, back, 'Not saved: the grace time should be 0 to 180 minutes');
  const area = pt || before.area ? { lat: (pt || before.area)!.lat, lng: (pt || before.area)!.lng, radius } : null;
  set.rules = { ...set.rules, attArea: area, attAcc: acc, attGrace: grace };
  await store.saveSettings(set);
  await attLog(pid, `Attendance settings for ${p!.name} changed by ${staffName(me)}: ${area ? `office point ${area.lat.toFixed(5)}, ${area.lng.toFixed(5)}, radius ${radius} m` : 'no office point yet'}, accuracy limit ${acc} m, grace ${grace} min`, me);
  go(fd, back, area ? `Saved: staff can check in within ${radius} m of ${p!.name}'s office point` : 'Saved. Set the office point so staff can check in.');
}
