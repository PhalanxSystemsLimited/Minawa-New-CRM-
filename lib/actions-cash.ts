'use server';
// Cash only (17 Nov 2026): reversing a wrong payment, a building manager cancelling a cash entry before it is
// confirmed, and the cash hand-over: building manager → Accountant → bank deposit.
import { redirect } from 'next/navigation';
import { requireRole, staffName } from './session';
import { mutate, liveProjects } from './ops';
import { ownerById, at, reversePayment, cancelCash, handOver, receiveHandover, depositHandovers } from './engine';
import { changeOrRequest } from './approvals';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, toast: string): never => redirect(path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(toast));
async function attempt<T>(fn: () => Promise<T>): Promise<T | { error: string }> { try { return await fn(); } catch (e) { return { error: (e as Error).message }; } }
const failed = (x: unknown): x is { error: string } => !!x && typeof x === 'object' && 'error' in x;

/** Reverse a wrong payment: the Admin does it at once; the Accountant's request waits for the Admin. */
export async function reverseAction(fdata: FormData) {
  const staff = await requireRole('admin', 'accountant'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), payId = S(fdata, 'pay'), reason = S(fdata, 'reason');
  const back = `/p/${pid}/apartments/${oid}`;
  if (!reason) go(`${back}?m=reverse-${encodeURIComponent(payId)}`, 'Write why this payment is wrong');
  const r = await attempt(() => mutate(pid, staff, s => {
    const o = ownerById(oid); if (!o) throw new Error('Apartment not found');
    if (staff.role === 'admin') { const p = s.payments.find(x => x.id === payId); if (!p) throw new Error('That payment was not found'); reversePayment(o, p, reason, staffName(staff), s.today, at(15)); return `Payment ${p.receipt} reversed. ${o.apt}'s balance is back to what it was`; }
    return changeOrRequest(o, 'reverse', { pid: payId, reason }, reason).text;
  }));
  go(back, failed(r) ? r.error : r);
}

/** A building manager cancels his own cash entry before the Accountant confirms it. */
export async function cancelCashAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), id = S(fdata, 'id'), reason = S(fdata, 'reason');
  const r = await attempt(() => mutate(pid, staff, s => {
    const pr = s.proofs.find(x => x.id === id);
    if (!pr || pr.kind !== 'cash' || pr.byId !== staff.id) throw new Error('You can only cancel your own entries');
    cancelCash(pr, staffName(staff), reason, s.today, at(15));
  }, { send: false }));
  go(`/p/${pid}/apartments/${oid}`, failed(r) ? r.error : 'Cash entry cancelled. Nothing changed on the owner\'s account.');
}

/** A building manager hands his confirmed cash in one building over to the Accountant. */
export async function handOverAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid');
  const r = await attempt(() => mutate(pid, staff, s => handOver(staff.id, staffName(staff), S(fdata, 'note'), s.today, at(15)), { send: false }));
  go('/cash', failed(r) ? r.error : `Hand-over ${r.id} of Rs ${r.amount.toLocaleString('en-US')} sent. The Accountant confirms it once the cash is counted.`);
}

/** The Accountant receives a hand-over (counted, all there) or sends it back with a note. */
export async function receiveHandoverAction(fdata: FormData) { return answerHandover(fdata, true); }
/** …or sends it back: the cash goes back to "with the building manager" until it is sorted out. */
export async function returnHandoverAction(fdata: FormData) { return answerHandover(fdata, false); }
async function answerHandover(fdata: FormData, ok: boolean) {
  const staff = await requireRole('accountant'), pid = S(fdata, 'pid'), id = S(fdata, 'id'), reply = S(fdata, 'reply');
  if (!ok && !reply) go('/cash', 'Write what is wrong (for example how much was short)');
  const r = await attempt(() => mutate(pid, staff, s => {
    const h = s.handovers.find(x => x.id === id); if (!h) throw new Error('Hand-over not found');
    receiveHandover(h, ok, staffName(staff), reply, s.today, at(15)); return h;
  }, { send: false }));
  go('/cash', failed(r) ? r.error : ok ? `Received Rs ${r.amount.toLocaleString('en-US')} from ${r.fromName}` : `Sent back to ${r.fromName} with your note`);
}

/** The Accountant deposits received cash in the bank: one slip can cover hand-overs from several buildings. */
export async function depositAction(fdata: FormData) {
  const staff = await requireRole('accountant'), slip = S(fdata, 'slip'), d = S(fdata, 'd');
  const picked = fdata.getAll('h').map(String).filter(Boolean);
  if (!slip || !/^\d{4}-\d{2}-\d{2}$/.test(d)) go('/cash', 'Enter the deposit slip number and the date');
  if (!picked.length) go('/cash', 'Tick the hand-overs that went into the bank');
  const by = new Map<string, string[]>();
  for (const x of picked) { const [pid, id] = x.split(':'); by.set(pid, [...(by.get(pid) || []), id]); }
  const allowed = new Set((await liveProjects(staff)).map(p => p.id));
  let total = 0, n = 0;
  for (const [pid, ids] of by) {
    if (!allowed.has(pid)) continue;
    const list = await mutate(pid, staff, s => depositHandovers(ids, slip, d, staffName(staff), s.today, at(15)), { send: false });
    total += list.reduce((a, h) => a + h.amount, 0); n += list.length;
  }
  go('/cash', n ? `Rs ${total.toLocaleString('en-US')} deposited, slip ${slip} (${n} hand-over${n === 1 ? '' : 's'})` : 'Nothing to deposit');
}

