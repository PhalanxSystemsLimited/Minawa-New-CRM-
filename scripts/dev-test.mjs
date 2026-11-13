// Runs the CRM on your computer in LOCAL TEST MODE:
//  - sample data in data/local-db.json, NOT the live Supabase database (so test payments never touch real balances);
//  - WhatsApp is sent by hand from Send on WhatsApp, as on the live site;
//  - Pay Now opens the test checkout (no Safepay keys needed).
// Sign in as admin@minawa.local or accountant@minawa.local (password: LOCAL_PASSWORD, default "minawa").
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';

const require = createRequire(import.meta.url);
const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost';
const env = {
  ...process.env,
  // Local mode: empty values here win over .env.local (Next.js keeps values that are already set).
  NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
  // Payments: the test checkout.
  SAFEPAY_SECRET_KEY: '', SAFEPAY_WEBHOOK_SECRET: '', ALLOW_SIMULATED_PAYMENTS: 'true',
  APP_URL: `http://${lan}:3000`,
  // Pretend date for testing (e.g. npm run dev:test -- 2026-11-25 to see bill day). The sample data starts on 2026-11-11.
  APP_TODAY: /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : (process.env.APP_TODAY || '2026-11-11')
};
console.log(`\nMinawa CRM, LOCAL TEST MODE (sample data, WhatsApp by hand, test checkout). Today is ${env.APP_TODAY}.`);
console.log(`Open http://localhost:3000 here, or http://${lan}:3000 on your phone (same Wi-Fi).\n`);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', '3000'], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
