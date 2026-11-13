// LOCAL TEST ONLY: a WhatsApp bridge that logs into your own WhatsApp by QR code (WhatsApp Web, via Baileys)
// and answers the CRM exactly like Meta's WhatsApp Cloud API. The CRM's sending code doesn't change; to go live,
// stop the bridge and set the real Meta keys.
//
// Safety: whatever owner the CRM addresses, the bridge only ever sends to ONE test number: WHATSAPP_TEST_NUMBER in
// .env.local, or your own number ("Message yourself" chat) if that is empty. Each message says at the top who it would
// have gone to. It never messages anyone else.
// WhatsApp Web automation is not an official WhatsApp product: use it only for this kind of light self-testing.
//
//   npm run wa:bridge      (then scan the QR: WhatsApp › Settings › Linked devices › Link a device)
//   npm run dev:test       (the CRM in local test mode, using this bridge)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, type WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require('qrcode-terminal') as { generate: (s: string, o: { small: boolean }) => void };
import { TEMPLATES } from '../lib/defaults';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());   // reads .env.local (WHATSAPP_TEST_NUMBER)
const TEST_TO = (process.env.WHATSAPP_TEST_NUMBER || '').replace(/\D/g, '').replace(/^0(?=3\d{9}$)/, '92');

const PORT = Number(process.env.WA_BRIDGE_PORT || 3011);
const SESSION = path.join(process.cwd(), '.wa-bridge', 'session');
const lanIp = () => Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost';
const APP = (process.env.BRIDGE_APP_URL || `http://${lanIp()}:3000`).replace(/\/$/, '');

let sock: WASocket | null = null, me = '', ready = false, retry = 0;
const media = new Map<string, { buf: Buffer; name: string }>();

async function connect() {
  fs.mkdirSync(SESSION, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: ['Minawa CRM (local test)', 'Chrome', '1.0'], markOnlineOnConnect: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', u => {
    if (u.qr) { console.log('\nScan this with WhatsApp › Settings › Linked devices › Link a device:\n'); qrcode.generate(u.qr, { small: true }); }
    if (u.connection === 'open') {
      me = String(sock?.user?.id || '').split(':')[0].split('@')[0]; ready = true; retry = 0;
      console.log(`\n✔ Connected as +${me}.`);
      if (TEST_TO) sock?.onWhatsApp(`${TEST_TO}@s.whatsapp.net`).then(r => console.log(r?.[0]?.exists
        ? `  Every CRM message will be sent to the test number +${TEST_TO} only (WHATSAPP_TEST_NUMBER in .env.local).`
        : `  ⚠ +${TEST_TO} (WHATSAPP_TEST_NUMBER) doesn't seem to be on WhatsApp. Check the number in .env.local.`)).catch(() => undefined);
      else console.log('  Every CRM message will be sent to this number only (your "Message yourself" chat).');
      console.log(`  Pay Now links point to ${APP} (open them on this PC, or on your phone on the same Wi-Fi).\n`);
    }
    if (u.connection === 'close') {
      ready = false;
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) { console.log('Logged out on the phone. Deleting the saved session; run npm run wa:bridge again to scan a new QR.'); fs.rmSync(SESSION, { recursive: true, force: true }); process.exit(0); }
      const wait = Math.min(30, 2 ** Math.min(retry++, 5));
      console.log(`Connection closed (${(u.lastDisconnect?.error as Error | undefined)?.message || 'no reason given'}). Reconnecting in ${wait}s…`); setTimeout(connect, wait * 1000);
    }
  });
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
function templateText(name: string) {
  const t = Object.values(TEMPLATES).find(x => x.metaName === name || name.startsWith(x.metaName));
  return t ? t.text : null;
}
const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const fail = (res: http.ServerResponse, message: string, code = 503) => json(res, code, { error: { message } });

// A brake for testing: at most WA_BRIDGE_MAX messages per 10 minutes (default 20). More fail (visibly, in the CRM)
// instead of flooding one WhatsApp chat, e.g. if a notice is sent to a whole project by mistake.
const MAX = Math.max(1, Number(process.env.WA_BRIDGE_MAX || 20)), recent: number[] = [];
async function send(to: string, text: string, doc: { buf: Buffer; name: string } | null) {
  if (!sock || !ready) throw new Error('The local WhatsApp bridge is not connected yet: scan the QR in the bridge window (npm run wa:bridge).');
  const now = Date.now(); while (recent.length && now - recent[0] > 600e3) recent.shift();
  if (recent.length >= MAX) throw new Error(`Test bridge limit: ${MAX} messages per 10 minutes. Not sent; test with one or two flats at a time.`);
  recent.push(now);
  const jid = `${TEST_TO || me}@s.whatsapp.net`;   // the one test number (or yourself), never the owner
  const head = `🧪 *Minawa CRM test* · would go to +${to}\n\n`;
  const sent = doc
    ? await sock.sendMessage(jid, { document: doc.buf, mimetype: 'application/pdf', fileName: doc.name, caption: head + text })
    : await sock.sendMessage(jid, { text: head + text });
  return sent?.key?.id || 'local.' + crypto.randomUUID();
}

http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks), url = new URL(req.url || '/', `http://localhost:${PORT}`), parts = url.pathname.split('/').filter(Boolean);
    try {
      // GET /v23.0/{phone-id}?fields=… : who is sending (shown in Staff & connections)
      if (req.method === 'GET' && parts.length === 2) return json(res, 200, { display_phone_number: me ? '+' + me : 'not connected', verified_name: 'Minawa Group (local test bridge)', quality_rating: ready ? 'TEST' : 'NOT CONNECTED', url: '', mime_type: '' });
      // POST /v23.0/{phone-id}/media : the bill or receipt PDF
      if (req.method === 'POST' && parts[2] === 'media') {
        const form = await new Request(url, { method: 'POST', headers: req.headers as HeadersInit, body }).formData();
        const file = form.get('file') as File | null;
        if (!file) return fail(res, 'No file', 400);
        const id = 'media.' + crypto.randomUUID();
        media.set(id, { buf: Buffer.from(await file.arrayBuffer()), name: file.name || 'document.pdf' });
        return json(res, 200, { id });
      }
      // POST /v23.0/{phone-id}/messages : a template (bill, reminder, receipt…) or a text
      if (req.method === 'POST' && parts[2] === 'messages') {
        const m = JSON.parse(body.toString() || '{}');
        if (m.type === 'text') return json(res, 200, { messages: [{ id: await send(m.to, m.text?.body || '', null) }] });
        const name = m.template?.name || '', comps = (m.template?.components || []) as { type: string; parameters?: { type: string; parameter_name?: string; text?: string; document?: { id: string; filename?: string } }[] }[];
        const vars = Object.fromEntries((comps.find(c => c.type === 'body')?.parameters || []).map(p => [p.parameter_name || '', p.text || '']));
        const docId = comps.find(c => c.type === 'header')?.parameters?.[0]?.document;
        const button = comps.find(c => c.type === 'button')?.parameters?.[0]?.text;
        const tpl = templateText(name);
        let text = tpl ? fill(tpl, vars) : `[${name}]\n` + Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('\n');
        if (button) text += `\n\n👉 Pay Now: ${APP}/pay/${button}`;
        const doc = docId ? media.get(docId.id) || null : null;
        if (doc && docId?.filename) doc.name = docId.filename;
        const id = await send(m.to, text, doc);
        console.log(`→ ${name || 'text'} for +${m.to}${doc ? ' (with PDF)' : ''}`);
        return json(res, 200, { messages: [{ id }] });
      }
      // Template submission and sample uploads: accepted locally (nothing goes to Meta).
      if (req.method === 'POST' && (parts[2] === 'message_templates' || parts[2] === 'uploads')) return json(res, 200, { id: 'local', status: 'APPROVED', h: 'local' });
      if (req.method === 'POST' && parts.length === 2) return json(res, 200, { h: 'local' });
      return fail(res, `The local bridge doesn't handle ${req.method} ${url.pathname}`, 404);
    } catch (e) { return fail(res, (e as Error).message); }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Local WhatsApp bridge on http://127.0.0.1:${PORT} (test only).`));

connect().catch(e => { console.error(e); process.exit(1); });
