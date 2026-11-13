// npm run daily: the daily billing run from the command line (same as /api/cron/daily).
import { config } from 'dotenv';
config({ path: '.env.local' }); config();

async function main() {
  const { runDailyAll } = await import('../lib/ops');
  console.log(JSON.stringify(await runDailyAll(null), null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
