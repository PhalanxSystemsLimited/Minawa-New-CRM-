/** Scheduled calls carry `Authorization: Bearer CRON_SECRET` (Supabase pg_cron, or Vercel Cron). */
export function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}
