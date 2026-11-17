// After the engine has recorded messages: keeps the Send on WhatsApp list tidy. Messages are only ever sent by hand.
// Runs inside the store lock.
import type { State } from './types';
import { use, ownerById, balance } from './engine';
import { waDigits } from './fmt';


/** Owner's number in international digits: 0300… becomes 92300…; +92 300 … becomes 92300…. */
export function intl(phone: string) {
  let d = waDigits(phone);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1);
  return d;
}

/** After any change: drops dues messages still waiting to be sent by hand once the owner has paid. Nothing is sent
 *  automatically: messages wait in Send on WhatsApp. */
export async function dispatch(s: State) {
  const c = { skipped: 0 };
  for (const m of s.messages) {
    if (m.from !== 'biz') continue;
    if (m.status === 'queued') m.status = 'pending';   // from before sending was by hand only
    if (m.status === 'pending' && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit') {
      const o = use(s, () => ownerById(m.ownerId));
      if (o && use(s, () => balance(o)) <= 0) { m.status = 'skipped'; m.error = 'Paid before it was sent, so not needed'; c.skipped++; }
    }
  }
  return c;
}
