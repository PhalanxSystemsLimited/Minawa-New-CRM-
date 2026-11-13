// Runs the CRM on your computer against the LIVE Supabase database (from .env.local). Safety rails, because this
// is real data:
//  - every WhatsApp chat opens with WHATSAPP_TEST_NUMBER (required: the CRM won't start without it), and messages are
//    marked as test sends so no owner's history suggests they received them;
//  - no test checkout: Pay Now can't record a pretend payment in the real books (test payments: npm run dev:test);
//  - no pretend dates: APP_TODAY is ignored, so nothing is billed early;
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import nextEnv from '@next/env';

const require = createRequire(import.meta.url);
nextEnv.loadEnvConfig(process.cwd());
const test = (process.env.WHATSAPP_TEST_NUMBER || '').replace(/\D/g, '');
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Supabase isn\'t set in .env.local. Use npm run dev:test for sample data.'); process.exit(1); }
if (!test) { console.error('Set WHATSAPP_TEST_NUMBER in .env.local first: on live data every message must go to a test number.'); process.exit(1); }
const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost';
const env = {
  ...process.env,
  WHATSAPP_TEST_NUMBER: '+' + test,
  ALLOW_SIMULATED_PAYMENTS: 'false', APP_TODAY: '',
  APP_URL: `http://${lan}:3000`
};
console.log(`\nMinawa CRM, LIVE DATA (Supabase). WhatsApp is sent by hand.`);
console.log(`Every chat opens with +${test} only. No test payments. Today is the real date.`);
console.log(`Open http://localhost:3000, or http://${lan}:3000 on your phone (same Wi-Fi).\n`);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', '3000'], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
