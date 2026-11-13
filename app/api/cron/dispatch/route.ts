// Every 10 minutes: payments Safepay confirmed but whose webhook was missed, and Safepay links for new messages.
import { NextResponse } from 'next/server';
import { dispatchAll } from '@/lib/ops';
import { authorised } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try { return NextResponse.json({ ok: true, projects: await dispatchAll() }); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
}
export const POST = run;
export const GET = run;
