// Health check (21 Nov 2026) for an uptime monitor (e.g. UptimeRobot, every 5 minutes): GET or HEAD
// https://<site>/api/health. No sign-in and no data in the answer. It also makes one tiny database read, so the
// Supabase project counts as active and isn't paused for being idle. 200 = all fine; 503 = the database didn't answer.
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function check() {
  const t0 = Date.now();
  let db: 'ok' | 'down' = 'ok';
  try {
    const store = await getStore();
    await Promise.race([store.ping(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000))]);
  } catch { db = 'down'; }
  return { ok: db === 'ok', db, ms: Date.now() - t0, at: new Date().toISOString() };
}
const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex' };

export async function GET() {
  const r = await check();
  return Response.json({ status: r.ok ? 'ok' : 'degraded', database: r.db, responseMs: r.ms, time: r.at }, { status: r.ok ? 200 : 503, headers });
}
export async function HEAD() {
  const r = await check();
  return new Response(null, { status: r.ok ? 200 : 503, headers });
}
