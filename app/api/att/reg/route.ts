// Registering a phone on a personal attendance link (23 Nov 2026): 'options' starts it (the phone then asks for the
// fingerprint and makes a passkey), 'verify' checks and saves it, waiting for the building manager's approval.
import { NextResponse } from 'next/server';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { getStore } from '@/lib/store';
import { attLog } from '@/lib/attendance';
import { site, putChallenge, takeChallenge, empByToken, phoneLabel } from '@/lib/att-web';

export const dynamic = 'force-dynamic';
const no = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { action?: string; token?: string; response?: unknown };
  const e = await empByToken(String(b.token || ''));
  if (!e || !e.active) return no('This attendance link is not valid or is switched off.', 404);
  if (e.device?.status === 'approved') return no('A phone is already registered on this link. Ask your manager to reset it if you changed phones.');
  if (e.device?.status === 'pending') return no('A phone is already waiting for your manager\'s approval. If it was not yours, ask your manager to reset it.');
  const { rpID, origin } = await site();
  if (b.action === 'options') {
    const opts = await generateRegistrationOptions({
      rpName: 'Minawa Attendance', rpID, userName: `${e.empNo} ${e.name}`, userDisplayName: e.name, userID: new Uint8Array(Buffer.from(e.id)) as Uint8Array<ArrayBuffer>,
      attestationType: 'none', authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' }, preferredAuthenticatorType: 'localDevice'
    });
    await putChallenge({ c: opts.challenge, tok: e.token, k: 'reg' });
    return NextResponse.json({ ok: true, options: opts });
  }
  if (b.action === 'verify') {
    const ch = await takeChallenge(e.token, 'reg');
    if (!ch) return no('That took too long. Try again.');
    try {
      const v = await verifyRegistrationResponse({ response: b.response as Parameters<typeof verifyRegistrationResponse>[0]['response'], expectedChallenge: ch, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified) return no('The phone could not be registered. Try again.');
      const cr = v.registrationInfo.credential, label = phoneLabel(req.headers.get('user-agent') || '');
      e.device = { kind: 'web', credId: cr.id, publicKey: Buffer.from(cr.publicKey).toString('base64url'), counter: cr.counter, transports: (cr.transports || []) as string[], label, status: 'pending', at: new Date().toISOString(), approvedBy: null, approvedAt: null };
      await (await getStore()).saveEmployee(e);
      await attLog(e.projects[0] || null, `${e.name} (${e.empNo}) registered a phone for attendance (${label}); waiting for approval`, null);
      return NextResponse.json({ ok: true });
    } catch (x) { return no(`The phone could not be registered: ${(x as Error).message}`); }
  }
  return no('Unknown step');
}
