// WhatsApp (Meta) webhook: delivery and read receipts, owners' replies and screenshots, template approvals.
// In Meta: WhatsApp > Configuration > Webhook URL = https://YOUR-CRM/api/whatsapp/webhook, verify token =
// WHATSAPP_VERIFY_TOKEN, and subscribe to "messages" and "message_template_status_update".
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getStore } from '@/lib/store';
import { load } from '@/lib/ops';
import { use, ownerById, balance, ownerProof, pushMsg, log } from '@/lib/engine';
import { nowPKT, waDigits } from '@/lib/fmt';
import { projects } from '@/lib/ops';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  return new Response('forbidden', { status: 403 });
}

function signatureOk(raw: string, sig: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true;  // set META_APP_SECRET to check that calls come from Meta
  if (!sig) return false;
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

interface Change { field: string; value: { statuses?: { id: string; status: string; errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[] }[]; messages?: { from: string; id: string; type: string; text?: { body: string }; image?: { id: string; caption?: string }; document?: { id: string; caption?: string; filename?: string } }[]; event?: string; message_template_name?: string; reason?: string } }

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  const body = JSON.parse(raw || '{}') as { entry?: { changes?: Change[] }[] };
  const store = await getStore();
  for (const entry of body.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    if (ch.field === 'message_template_status_update' && v.message_template_name) { await templateStatus(v.message_template_name, String(v.event || ''), v.reason); continue; }
    for (const st of v.statuses || []) {
      const at = await store.locate({ waId: st.id }); if (!at) continue;
      await store.withLock(async () => {
        const s = await load(at.project, null), m = s.messages.find(x => x.id === at.id); if (!m) return;
        const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };
        if (st.status === 'failed') {
          const e = st.errors?.[0]; m.status = 'failed'; m.error = e?.error_data?.details || e?.message || e?.title || 'Failed';
          const o = use(s, () => ownerById(m.ownerId));
          if (o && (e?.code === 131026 || e?.code === 131021)) { o.invalidPhone = true; }
          use(s, () => log(s.today, nowPKT(), 'alert', `WhatsApp ${m.title} to ${o?.apt} failed: ${m.error}`, m.ownerId));
        } else if ((rank[st.status] ?? -1) > (rank[m.status] ?? -1)) m.status = st.status as typeof m.status;
        await store.saveState(s);
      });
    }
    for (const msg of v.messages || []) {
      const at = await store.locate({ phoneDigits: waDigits(msg.from) }); if (!at) continue;
      await store.withLock(async () => {
        const s = await load(at.project, null);
        use(s, () => {
          const o = ownerById(at.id), t = nowPKT();
          if (msg.type === 'image' || msg.type === 'document') {
            const media = (msg.image || msg.document)!.id, cap = (msg.image || msg.document)!.caption || '';
            // A picture or PDF from an owner who owes money is most likely a transfer slip: to To do, for checking.
            if (balance(o) > 0) ownerProof(o, balance(o), s.today, t, media, cap ? `Sent a ${msg.type === 'image' ? 'picture' : 'document'}: "${cap}"` : `Sent a ${msg.type === 'image' ? 'picture' : 'document'} on WhatsApp.`);
            else { pushMsg(o, s.today, t, { from: 'owner', kind: 'reply', title: 'Owner reply', text: cap || `(${msg.type})`, shot: true }); log(s.today, t, 'message', `${o.apt} sent a ${msg.type} on WhatsApp`, o.id); }
          } else {
            const text = msg.text?.body || `(${msg.type})`;
            pushMsg(o, s.today, t, { from: 'owner', kind: 'reply', title: 'Owner reply', text });
            o.notes.push({ d: s.today, by: 'WhatsApp', text: `Owner wrote: ${text}` });
            log(s.today, t, 'message', `${o.apt} replied on WhatsApp: ${text.slice(0, 120)}`, o.id);
          }
        });
        await store.saveState(s);
      });
    }
  }
  return NextResponse.json({ ok: true });
}

async function templateStatus(name: string, event: string, reason?: string) {
  const store = await getStore(), live = (await projects()).find(p => p.live);
  if (!live) return;
  await store.withLock(async () => {
    const s = await load(live.id, null);
    for (const t of Object.values(s.templates)) {
      if (t.pendingName === name && event === 'APPROVED') { t.text = t.pending || t.text; t.metaName = name; t.pending = null; t.pendingName = null; t.status = 'approved'; }
      else if (t.pendingName === name && (event === 'REJECTED' || event === 'DISABLED')) { t.pending = null; t.pendingName = null; t.status = 'approved'; }
      else continue;
      await store.saveTemplates(s.templates);
      await store.appendLog([{ id: 'L' + Date.now(), project: null, d: s.today, t: nowPKT(), kind: 'admin', text: `Meta ${event.toLowerCase()} the ${t.label} template (${name})${reason && reason !== 'NONE' ? `: ${reason}` : ''}`, ownerId: null }]);
    }
  });
}
