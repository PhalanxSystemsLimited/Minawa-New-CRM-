// The Attendance screen was opened: its notification counter starts again from now (on every device).
import { NextResponse } from 'next/server';
import { currentStaff } from '@/lib/session';
import { markAttSeen } from '@/lib/att-notify';

export const dynamic = 'force-dynamic';
export async function POST() {
  const s = await currentStaff();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  await markAttSeen(s);
  return NextResponse.json({ ok: true });
}
