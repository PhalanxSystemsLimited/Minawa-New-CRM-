'use server';
// Approving or rejecting an accountant's change to an owner's charges (admins), or withdrawing your own request.
import { redirect } from 'next/navigation';
import { requireStaff, requireAdmin } from './session';
import { mutate } from './ops';
import { decide, withdraw } from './approvals';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const back = (fd: FormData) => { const b = S(fd, 'back'); return b.startsWith('/') && !b.startsWith('//') ? b : '/approvals'; };
const go = (path: string, toast: string): never => redirect(path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(toast));

async function decideAction(fdata: FormData, approve: boolean) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), id = S(fdata, 'id');
  let r: { ok: boolean; text: string };
  try { r = await mutate(pid, staff, () => decide(id, approve, S(fdata, 'reply')), { send: false }); }
  catch (e) { r = { ok: false, text: `Not approved: ${(e as Error).message}` }; }
  go(back(fdata), r.text);
}
export async function approveAction(fdata: FormData) { return decideAction(fdata, true); }
export async function rejectAction(fdata: FormData) { return decideAction(fdata, false); }

export async function withdrawApprovalAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id');
  const r = await mutate(pid, staff, () => withdraw(id, staff.id, staff.role === 'admin'), { send: false });
  go(back(fdata), r.text);
}
