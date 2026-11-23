// "Ask manager" (23 Nov 2026): after a refused check-in or check-out (fingerprint already checked), the phone sends the
// signed ticket it got; the request waits for the building manager (the Admin for managers and accountants).
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getStore } from '@/lib/store';
import { unsign } from '@/lib/attendance';
import type { AttPlace } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { ticket?: string; note?: string };
  const t = unsign<{ e: string; kind: 'checkin' | 'checkout'; d: string; t: string; reason: string; place: AttPlace | null; project: string }>(b.ticket);
  if (!t) return NextResponse.json({ ok: false, error: 'This request has expired. Try checking in again.' }, { status: 400 });
  const store = await getStore(), have = await store.listAttRequests({ status: 'pending' });
  if (have.some(r => r.employeeId === t.e && r.d === t.d && r.kind === t.kind)) return NextResponse.json({ ok: true, msg: 'Already sent: your manager has your request.' });
  const note = String(b.note || '').trim().slice(0, 200);
  await store.saveAttRequest({ id: `RQ-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, employeeId: t.e, project: t.project, d: t.d, t: t.t, kind: t.kind, reason: note ? `${t.reason} · "${note}"` : t.reason, place: t.place, status: 'pending', decidedBy: null, decidedAt: null });
  return NextResponse.json({ ok: true, msg: 'Sent to your manager. You will be marked once they approve it.' });
}
