// A personal attendance link (23 Nov 2026): the employee's own page, no sign-in. First visit: register this phone
// (fingerprint), then wait for the building manager's approval. After that: check in and check out (fingerprint and
// location inside the building's area), and this month's days. Works on Android (Chrome) and iPhone (Safari).
import type { Metadata } from 'next';
import { empByToken } from '@/lib/att-web';
import { attCtx, dayView, graceOf, pname, shiftText, offText, workDay, when, STATUS_LABEL, distText, type DayView } from '@/lib/attendance';
import { getStore } from '@/lib/store';
import { AttPanel } from '@/components/AttPanel';
import { addDays, dow, fds, t12, fd, MONL } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return { title: 'Minawa Attendance', manifest: `/a/${encodeURIComponent(token)}/manifest.webmanifest`, appleWebApp: { capable: true, title: 'Attendance', statusBarStyle: 'default' }, robots: { index: false, follow: false } };
}

export default async function AttLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, e = await empByToken(token);
  const shell = (body: React.ReactNode) => <div className="signin-page att-page"><div className="signin-bg" aria-hidden="true"></div><main className="signin-main"><div className="signin-card att-card">
    <header className="signin-head"><span className="signin-mark"><img src="/assets/minawa-mark.png" alt="Minawa Group" /></span><p className="signin-eyebrow">Minawa Attendance</p></header>{body}</div>
    <footer className="signin-foot"><span>Your fingerprint never leaves your phone. Minawa only receives the phone&apos;s confirmation and your location at check-in and check-out.</span></footer></main></div>;
  if (!e) return shell(<><h1 className="signin-title">Link not valid</h1><p className="signin-sub">This attendance link doesn&apos;t work. It may have been replaced by a new one: ask your building manager for your link.</p></>);
  if (!e.active) return shell(<><h1 className="signin-title">{e.name}</h1><p className="signin-sub">This attendance link is switched off. Ask your building manager.</p></>);
  const c = await attCtx(), store = await getStore(), now = c.now, today = c.today, day = workDay(e, today, now.slice(11));
  const mon = day.slice(0, 7), from = `${mon}-01`;
  const recs = await store.listAttendance({ from: addDays(from, -1), to: today, employeeIds: [e.id] });
  const rec = recs.find(r => r.d === day) || null, grace = graceOf(c, e), view = dayView(e, day, rec, now, grace);
  const next: 'checkin' | 'checkout' | 'done' = !rec?.inAt ? 'checkin' : !rec.outAt ? 'checkout' : 'done';
  const pending = (await store.listAttRequests({ status: 'pending' })).filter(r => r.employeeId === e.id && r.d >= addDays(today, -1));
  const days: { d: string; v: DayView; r: typeof rec }[] = [];
  for (let d = day; d >= from; d = addDays(d, -1)) { const r = recs.find(x => x.d === d) || null; days.push({ d, v: dayView(e, d, r, now, grace), r }); }
  const areas = e.projects.map(p => ({ p, a: c.settings[p]?.area })).filter(x => x.a);
  const state = !e.device ? 'register' : e.device.status === 'pending' ? 'pending' : e.device.kind === 'android' ? 'android' : 'ready';
  return shell(<>
    <h1 className="signin-title att-name">{e.name}</h1>
    <p className="signin-sub">{e.empNo} · {e.designation} · {e.projects.map(p => pname(c, p)).join(', ')}</p>
    <div className="att-shift"><span><b>Working hours</b>{shiftText(e)}</span><span><b>Weekly off</b>{offText(e)}</span></div>
    <section className="att-today" data-tone={view.tone}>
      <div className="att-today-h"><span>{dow(day)} {fd(day)}</span><b>{rec?.inAt ? (rec.outAt ? `Checked out ${when(rec.outAt)}` : `Checked in ${when(rec.inAt)}`) : view.key === 'off' ? 'Your day off' : view.label || 'Not checked in'}</b>
        {rec ? <small>{STATUS_LABEL[rec.status]}{rec.how === 'manager' ? ` · marked by ${rec.byName || 'your manager'}` : ''}{rec.inPlace ? ` · ${distText(rec.inPlace.dist)} from the office point` : ''}</small> : null}</div>
    </section>
    <AttPanel token={e.token} state={state} next={next} label={e.device?.label || ''} registeredAt={e.device ? fd(new Date(Date.parse(e.device.at) + 5 * 3600e3).toISOString().slice(0, 10)) : ''}
      noArea={!areas.length} pending={pending.map(r => `${r.kind === 'checkin' ? 'Check-in' : 'Check-out'} at ${t12(r.t)} is waiting for your manager`)} />
    <details className="att-month" open={false}>
      <summary>{MONL[+mon.slice(5) - 1]}: {days.filter(x => x.v.marked).length} day{days.filter(x => x.v.marked).length === 1 ? '' : 's'} at work · {days.filter(x => x.v.key === 'late').length} late · {days.filter(x => x.v.key === 'absent').length} absent</summary>
      <ul>{days.map(x => <li key={x.d} data-tone={x.v.tone}><span>{dow(x.d)} {fds(x.d)}</span><b>{x.v.label || '—'}</b><small>{x.r?.inAt ? `${when(x.r.inAt)}${x.r.outAt ? ` – ${when(x.r.outAt)}` : ''}` : ''}</small></li>)}</ul>
    </details>
    <p className="att-tip">Tip: add this page to your Home Screen (Chrome menu ⋮ › Add to Home screen; on iPhone Safari: Share › Add to Home Screen). It then opens like an app.</p>
  </>);
}
