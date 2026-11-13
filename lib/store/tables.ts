// Table and column names shared by both stores. Objects use camelCase; Supabase columns are the snake_case
// of the same names (lib/store/supabase.ts converts). Nested objects (notes, discount, applied…) are jsonb.
export const TABLES = {
  owners: ['id', 'project', 'unit', 'apt', 'block', 'type', 'name', 'phone', 'email', 'possession', 'possessionKnown', 'opening', 'openingLeft', 'credit', 'feeDue',
    'exempt', 'exemptWhy', 'director', 'discount', 'abroad', 'invalidPhone', 'noPhone', 'rate', 'status', 'closedOn', 'flagged', 'flaggedOn', 'promiseUntil',
    'notes', 'suspensions', 'prevOwnerId', 'plan', 'floor', 'sheet', 'generator'],
  bills: ['id', 'ownerId', 'project', 'period', 'periodEnd', 'months', 'billDate', 'dueDate', 'finalDate', 'amount', 'discount', 'extras', 'net', 'paid', 'fine', 'finePaid', 'fined', 'fromCredit',
    'prev', 'noticeSkipped', 'flagSkipped', 'reminders', 'lines', 'bd'],
  entries: ['id', 'ownerId', 'project', 'd', 'kind', 'amount', 'desc', 'ref', 'pid'],
  links: ['id', 'ownerId', 'project', 'amount', 'status', 'created', 'cancelledOn', 'paidOn', 'sp', 'spSettled', 'spError'],
  messages: ['id', 'ownerId', 'project', 'd', 't', 'from', 'kind', 'title', 'text', 'tpl', 'vars', 'linkId', 'pdf', 'status', 'waId', 'error', 'manual', 'shot', 'sentAt'],
  payments: ['id', 'ownerId', 'project', 'd', 't', 'amount', 'method', 'ref', 'source', 'by', 'before', 'applied', 'balAfter', 'receipt', 'gateway', 'gwMode',
    'linkId', 'spLink', 'spTracker'],
  proofs: ['id', 'ownerId', 'project', 'd', 't', 'amount', 'status', 'msgId', 'doneOn', 'media'],
  alerts: ['id', 'ownerId', 'project', 'd', 'text', 'done'],
  clearances: ['no', 'ownerId', 'project', 'd', 'by'],
  rates: ['id', 'project', 'type', 'from', 'amount'],
  charges: ['id', 'ownerId', 'project', 'period', 'kind', 'amount', 'units', 'note', 'by', 'd', 'billId'],
  notices: ['id', 'project', 'd', 't', 'kind', 'title', 'text', 'audience', 'count', 'failed', 'by'],
  approvals: ['id', 'project', 'ownerId', 'kind', 'change', 'summary', 'before', 'note', 'byId', 'byName', 'd', 't', 'status', 'decidedById', 'decidedByName', 'decidedD', 'decidedT', 'reply']
} as const;
export type TableName = keyof typeof TABLES;
export const KEY: Record<TableName, string> = { owners: 'id', bills: 'id', entries: 'id', links: 'id', messages: 'id', payments: 'id', proofs: 'id', alerts: 'id', clearances: 'no', rates: 'id', charges: 'id', notices: 'id', approvals: 'id' };
export const STATE_TABLES: TableName[] = ['owners', 'bills', 'entries', 'links', 'messages', 'payments', 'proofs', 'alerts', 'clearances', 'rates', 'charges', 'notices', 'approvals'];

export const snake = (s: string) => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
export const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
// Reserved words in Postgres get a suffix as column names.
export const COL_RENAME: Record<string, string> = { desc: 'description', from: 'from_', by: 'by_', before: 'before_' };
export const toCol = (k: string) => COL_RENAME[k] || snake(k);
const BACK: Record<string, string> = Object.fromEntries(Object.entries(COL_RENAME).map(([k, v]) => [v, k]));
export const fromCol = (c: string) => BACK[c] || camel(c);

/** Rows in creation order: ids are a prefix and a counter (E12, BL-2613, PAY-1004), so sort by the number. */
const idNum = (r: Record<string, unknown>) => { const m = String(r.id ?? r.no ?? '').match(/(\d+)$/); return m ? +m[1] : 0; };
export function natSort<T>(rows: T[]): T[] { return rows.sort((a, b) => idNum(a as Record<string, unknown>) - idNum(b as Record<string, unknown>)); }
