'use server';
// Payment requests (26 Nov 2026, lib/requests.ts): the accountant asks, the building manager answers with an entry.
import { redirect } from 'next/navigation';
import { requireRole, staffName } from './session';
import { mutate, liveProjects } from './ops';
import { getStore } from './store';
import { photoFor } from './actions-photos';
import { photoStore } from './images';
import { ownerById, at } from './engine';
import { newRequest, cancelRequest, enterRequest } from './requests';
import { monthsIn, todayPKT } from './fmt';

const S = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (path: string, toast: string): never => redirect(path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(toast));
const okMonth = (x: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
/** Where the accountant's form goes back to: only his Collect payments screen. */
const backOf = (f: FormData) => { const b = S(f, 'back'); return /^\/collect(\?|$)/.test(b) ? b : '/collect'; };

/** The accountant (or an Admin) asks a building manager to collect from a customer. */
export async function createRequestAction(f: FormData) {
  const staff = await requireRole('accountant', 'admin'), pid = S(f, 'pid'), oid = S(f, 'oid'), back = backOf(f);
  const again = `${back}${back.includes('?') ? '&' : '?'}req=${encodeURIComponent(`${pid}:${oid}`)}`;
  const amount = Math.round(+S(f, 'amount').replace(/[,\s]/g, '') || 0), method = S(f, 'method') === 'Bank transfer' ? 'Bank transfer' as const : 'Cash' as const;
  const pf = S(f, 'periodFrom'), pt = S(f, 'periodTo') || pf, forWhat = S(f, 'forWhat') === 'electricity' ? 'electricity' as const : 'maintenance' as const, note = S(f, 'note').slice(0, 300), mid = S(f, 'manager');
  if (!(amount > 0)) go(again, 'Enter the amount to collect');
  if (!okMonth(pf) || !okMonth(pt)) go(again, 'Choose the months this payment is for');
  if (pt < pf) go(again, 'The last month must come after the first month');
  if (monthsIn(pf, pt) > 24) go(again, 'Choose at most 24 months for one request');
  if (!(await liveProjects(staff)).some(p => p.id === pid)) go(back, 'This building isn\'t yours');
  const mgr = (await (await getStore()).listStaff()).find(x => x.id === mid && x.role === 'manager' && x.active && !x.leftOn && (x.projects || []).includes(pid));
  if (!mgr) go(again, 'Choose the building manager who collects it');
  let err = '', id = '';
  try {
    const r = await mutate(pid, staff, s => { const o = ownerById(oid); if (!o) throw new Error('Customer not found'); return newRequest(o, { amount, method, periodFrom: pf, periodTo: pt, forWhat, note, managerId: mgr!.id, managerName: mgr!.name }, { id: staff.id, name: staffName(staff) }, s.today, at(15)); }, { send: false });
    id = r.id;
  } catch (e) { err = (e as Error).message; }
  if (err) go(again, err);
  go(back, `Request ${id} sent to ${mgr!.name}`);
}

/** The accountant takes back an open request. */
export async function cancelRequestAction(f: FormData) {
  const staff = await requireRole('accountant', 'admin'), pid = S(f, 'pid'), id = S(f, 'id'), back = backOf(f);
  let err = '';
  try { await mutate(pid, staff, s => { const r = (s.requests || []).find(x => x.id === id); if (!r) throw new Error('Request not found'); cancelRequest(r, staffName(staff), S(f, 'why').slice(0, 200), s.today, at(15)); }, { send: false }); }
  catch (e) { err = (e as Error).message; }
  go(back, err || `Request ${id} cancelled`);
}

/** The building manager answers a request with his entry: no WhatsApp; the accountant sends the receipt after approving. */
export async function enterRequestAction(f: FormData) {
  const staff = await requireRole('manager'), pid = S(f, 'pid'), id = S(f, 'id');
  const again = `/?r=${encodeURIComponent(`${pid}:${id}`)}`;
  const amount = Math.round(+S(f, 'amount').replace(/[,\s]/g, '') || 0), ref = S(f, 'ref').slice(0, 60), txn = S(f, 'txn').slice(0, 80), method = S(f, 'method');
  if (!(amount > 0)) go(again, 'Enter the amount you collected');
  if (method === 'Cash' && !ref) go(again, 'Enter the cash book number you wrote for the customer');
  if (method === 'Bank transfer' && !txn) go(again, 'Enter the bank transaction ID');
  let photo: string | null = null;
  if (method === 'Bank transfer') {
    try { photo = (await photoFor(S(f, 'photo'), pid, 'payment'))?.id || null; } catch (e) { go(again, (e as Error).message); }
    if (!photo && photoStore()) go(again, 'Add the photo of the bank transfer');
  }
  let err = '', pay = '';
  try {
    const pr = await mutate(pid, staff, s => {
      const r = (s.requests || []).find(x => x.id === id); if (!r) throw new Error('This request is no longer there.');
      if (r.method !== method) throw new Error('The payment method changed: open the request again.');
      return enterRequest(r, { amount, ref, txn, photoId: photo, paidOn: todayPKT(), note: S(f, 'note').slice(0, 200) }, staff.id, staffName(staff), s.today, at(15));
    }, { send: false, manager: true });
    pay = pr.payId || pr.id;
  } catch (e) { err = (e as Error).message; }
  if (err) go(again, err);
  if (photo) await (await getStore()).linkImage(photo, pay).catch(() => undefined);
  go('/?v=done', 'Entry saved. Your accountant sends the customer the receipt once he approves it.');
}
