// Safepay webhook. The payment is never trusted from the webhook body alone: we find our payment link,
// then ask Safepay's API for its status, and record the payment only if Safepay says it is paid.
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { load } from '@/lib/ops';
import { use, payLink, payStaleLink, log } from '@/lib/engine';
import { dispatch } from '@/lib/dispatch';
import { verifySignature, getQuickLink, safepayMode } from '@/lib/safepay';
import { nowPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

// Pull every string that could identify the link: our reference (PL-…), or Safepay's link/tracker ids.
function ids(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof x === 'string') { if (/^PL-\d+$/.test(x) || /^[a-z_]+_[0-9a-f-]{8,}$/i.test(x) || /^[0-9a-f-]{20,}$/i.test(x)) out.add(x); }
  else if (Array.isArray(x)) x.forEach(v => ids(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach(v => ids(v, out));
  return out;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signed = verifySignature(raw, req.headers.get('x-sfpy-signature'));
  let body: unknown = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const store = await getStore();
  let hit: { project: string; id: string } | null = null;
  for (const id of ids(body)) { hit = await store.locate(id.startsWith('PL-') ? { linkId: id } : { spLinkId: id }); if (hit) break; }
  if (!hit) return NextResponse.json({ ok: true, note: 'no matching payment link' });
  const result = await store.withLock(async () => {
    const s = await load(hit!.project, null), l = s.links.find(x => x.id === hit!.id);
    if (!l || !l.sp || l.spSettled) return 'nothing to do';
    const sp = await getQuickLink(l.sp.id);  // the source of truth
    if (!sp.isPaid) { use(s, () => log(s.today, nowPKT(), 'webhook', `Safepay webhook for ${l.id}: not paid (${sp.status})${signed ? '' : ', signature not verified'}`, l.ownerId)); await store.saveState(s); return 'not paid'; }
    l.sp.tracker = sp.tracker || l.sp.tracker;
    use(s, () => l.status === 'active' ? payLink(l, 'Card', s.today, nowPKT(), safepayMode()) : payStaleLink(l, s.today, nowPKT(), safepayMode()));
    await store.saveState(s);
    await dispatch(s);
    await store.saveState(s);
    return 'recorded';
  });
  return NextResponse.json({ ok: true, result, signed });
}
