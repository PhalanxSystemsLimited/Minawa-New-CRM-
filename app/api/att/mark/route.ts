// Check in / check out from a personal attendance link (23 Nov 2026). 'options' asks the phone for the fingerprint
// (its registered passkey); 'mark' checks the fingerprint, then the place (lib/attendance.ts mark), and saves it.
// A refusal because of the place comes with a signed ticket the phone can send to the manager ("Ask manager").
import { NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getStore } from '@/lib/store';
import { attCtx, mark, sign } from '@/lib/attendance';
import { site, putChallenge, takeChallenge, empByToken } from '@/lib/att-web';

export const dynamic = 'force-dynamic';
const no = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { action?: string; token?: string; kind?: string; response?: unknown; loc?: { lat?: number; lng?: number; acc?: number } };
  const e = await empByToken(String(b.token || ''));
  if (!e || !e.active) return no('This attendance link is not valid or is switched off.', 404);
  if (!e.device) return no('Register your phone first.');
  if (e.device.status !== 'approved') return no('Your phone is waiting for your manager\'s approval.');
  if (e.device.kind !== 'web') return no('This link\'s phone uses the Minawa Attendance app: check in from the app.');
  const { rpID, origin } = await site();
  if (b.action === 'options') {
    const opts = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: e.device.credId, transports: e.device.transports as never }], userVerification: 'required' });
    await putChallenge({ c: opts.challenge, tok: e.token, k: 'auth' });
    return NextResponse.json({ ok: true, options: opts });
  }
  if (b.action !== 'mark') return no('Unknown step');
  const kind = b.kind === 'checkout' ? 'checkout' : 'checkin', ch = await takeChallenge(e.token, 'auth');
  if (!ch) return no('That took too long. Try again.');
  try {
    const v = await verifyAuthenticationResponse({ response: b.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'], expectedChallenge: ch, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: e.device.credId, publicKey: new Uint8Array(Buffer.from(e.device.publicKey, 'base64url')) as Uint8Array<ArrayBuffer>, counter: e.device.counter, transports: e.device.transports as never } });
    if (!v.verified) return no('The fingerprint check did not match this link\'s registered phone.');
    if (v.authenticationInfo.newCounter > e.device.counter) { e.device.counter = v.authenticationInfo.newCounter; await (await getStore()).saveEmployee(e); }
  } catch { return no('The fingerprint check did not match this link\'s registered phone.'); }
  const loc = { lat: Number(b.loc?.lat), lng: Number(b.loc?.lng), acc: Number(b.loc?.acc ?? 9999) };
  const c = await attCtx(), r = await mark(c, e, kind, loc, 'fingerprint');
  if (r.ok) return NextResponse.json({ ok: true, msg: r.msg, rec: r.rec });
  const ticket = r.askable ? sign({ e: e.id, kind, d: c.today, t: c.now.slice(11), reason: r.reason, place: r.place, project: r.project || e.projects[0] || '' }, 1800) : null;
  return NextResponse.json({ ok: false, error: r.reason, ticket });
}
