// Called by Supabase pg_cron every day at 10:00 PKT (or Vercel Cron): the billing run for every project.
import { NextResponse } from 'next/server';
import { runDailyAll } from '@/lib/ops';
import { authorised } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try { return NextResponse.json({ ok: true, projects: await runDailyAll(null) }); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
}
export const POST = run;
export const GET = run;
