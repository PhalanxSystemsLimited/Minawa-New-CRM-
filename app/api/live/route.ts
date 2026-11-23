// Live updates for the open CRM (polled every few seconds): runs the day's billing once it is 11:00 AM (bills on each
// customer's billing date, reminders on the 3rd and 7th…) and returns the data's revision (it changes whenever anything
// is saved: open screens refresh when it does), how many payments each project has that this person hasn't seen on
// Payments yet, and, when the revision is new to the screen asking, this person's notifications (lib/notify.ts), which
// the screen pops up as they arrive.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { liveProjects, autoDaily, load } from '@/lib/ops';
import { notesFor, type Note } from '@/lib/notify';
import { payKey, paySeenCookie, NEW_DAYS } from '@/lib/pay-seen';
import { addDays, todayPKT } from '@/lib/fmt';
import { attFeed } from '@/lib/att-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'signed out' }, { status: 401 });
  const ran = await autoDaily();
  const store = await getStore(), jar = await cookies(), today = todayPKT(), counts: Record<string, number> = {};
  for (const p of await liveProjects()) {
    const since = jar.get(paySeenCookie(staff.id, p.id))?.value || addDays(today, -NEW_DAYS) + 'T00:00';
    counts[p.id] = (await store.paymentsSince(p.id, since.slice(0, 10))).filter(r => payKey(r) > since).length;
  }
  // The revision also moves every 5 minutes, so time-based news (people not checked in yet) arrives without a save.
  const rev = (await store.revision()) + Math.floor(Date.now() / 300000), had = Number(new URL(req.url).searchParams.get('rev') || -1);
  // Notifications only when something changed since this screen last asked (they need every project loaded).
  let notes: Note[] | undefined;
  if (had !== rev) {
    try { notes = notesFor(staff, await Promise.all((await liveProjects(staff)).map(p => load(p.id, staff)))); } catch (e) { console.error('notes', (e as Error).message); }
    // Attendance (23 Nov 2026): check-ins, not checked in yet, phones and requests to approve, alerts.
    try { notes = [...(notes || []), ...(await attFeed(staff)).notes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100); } catch (e) { console.error('att notes', (e as Error).message); }
  }
  return NextResponse.json({ counts, ran, rev, notes }, { headers: { 'Cache-Control': 'no-store' } });
}
