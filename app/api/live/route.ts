// Live updates for the open CRM (polled every 30 seconds): runs the day's billing once a day (bills on the 25th,
// reminders on the 3rd and 7th…), checks Safepay for new payments (at most once a minute, whoever is online), and
// returns how many payments each project has that this person hasn't seen on Payments yet.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { liveProjects, autoSweep, autoDaily } from '@/lib/ops';
import { payKey, paySeenCookie, NEW_DAYS } from '@/lib/pay-seen';
import { addDays, todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'signed out' }, { status: 401 });
  const ran = await autoDaily(), recorded = await autoSweep();
  const store = await getStore(), jar = await cookies(), today = todayPKT(), counts: Record<string, number> = {};
  for (const p of await liveProjects()) {
    const since = jar.get(paySeenCookie(staff.id, p.id))?.value || addDays(today, -NEW_DAYS) + 'T00:00';
    counts[p.id] = (await store.paymentsSince(p.id, since.slice(0, 10))).filter(r => payKey(r) > since).length;
  }
  return NextResponse.json({ counts, recorded, ran }, { headers: { 'Cache-Control': 'no-store' } });
}
