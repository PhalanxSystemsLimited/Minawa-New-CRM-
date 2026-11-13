// Data model. One shape is used everywhere: the billing engine, the screens, and both stores (Supabase and the
// local file store). It mirrors the demo's state, so the engine logic carries over line for line.

export type Role = 'admin' | 'accountant';
export type ISODate = string; // YYYY-MM-DD

export interface Project {
  id: string; name: string; place: string; kind: string;
  live: boolean;            // maintenance set up (owners imported)
  goLive: ISODate | null;   // first day the system bills
  bank: string;             // account title · bank · IBAN shown on bills
}

export interface Rate { id: string; project: string; type: string; from: ISODate; amount: number }

// Minawa's billing calendar: every flat is billed on the 25th (the bill is the 1st reminder), due 15 days later,
// with two more reminders before the due date. The day after the due date the fine is added and a final notice
// goes out; flats still unpaid `flagDays` after the due date are flagged for disconnection.
export interface Rules {
  billDay: number;          // day of the month bills go out (25)
  dueDays: number;          // due date = bill day + dueDays (15)
  remindDays: number[];     // more reminders, this many days before the due date ([7, 3])
  feePct: number;           // fine, % of the unpaid bills (and old arrears if fineArrears) while a bill is overdue; set by accountants (10)
  flagDays: number;         // flag for disconnection this many days after the due date (15)
  autoSend: boolean;        // true: WhatsApp messages go out automatically (Business API); false: staff send them by hand on WhatsApp Web
  sendHour: number;         // hour (PKT) the daily run goes out (11)
  utilities: string[];      // utility bills entered each month for this project, e.g. ['Electricity']
  /** Fine old arrears (opening balances from before go-live) too. Off: the fine is only on the system's own bills. */
  fineArrears: boolean;
}
export const DEFAULT_RULES: Rules = { billDay: 25, dueDays: 15, remindDays: [7, 3], feePct: 10, flagDays: 15, autoSend: false, sendHour: 11, utilities: [], fineArrears: false };
export function normRules(r: Partial<Rules> & Record<string, unknown>): Rules {
  const x = { ...DEFAULT_RULES, ...r } as Rules;
  if (!Array.isArray(x.remindDays)) x.remindDays = typeof x.remindDays === 'number' && x.remindDays > 0 ? [x.remindDays] : [];
  if (!Array.isArray(x.utilities)) x.utilities = [];
  x.fineArrears = x.fineArrears === true;
  return x;
}
export type Plan = 'monthly' | 'quarterly' | 'annual';
export const PLAN_MONTHS: Record<Plan, number> = { monthly: 1, quarterly: 3, annual: 12 };
export const PLAN_LABEL: Record<Plan, string> = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annually' };

export interface Discount { kind: 'pct' | 'fixed'; value: number; until: ISODate | null }
export interface Note { d: ISODate; by: string; text: string }
export interface Suspension { service: string; from: ISODate; to: ISODate | null; by: string }

export interface Owner {
  id: string; project: string; unit: string; apt: string; block: string; type: string;
  name: string; phone: string; email: string;
  possession: ISODate; possessionKnown: boolean;
  opening: number; openingLeft: number; credit: number; feeDue: number;
  exempt: boolean; exemptWhy: string | null; director: boolean;
  discount: Discount | null; abroad: boolean; invalidPhone: boolean; noPhone: boolean;
  rate: number | null;      // own rate, off the rate card
  status: 'active' | 'closed'; closedOn: ISODate | null;
  flagged: boolean; flaggedOn: ISODate | null; promiseUntil: ISODate | null;
  notes: Note[]; suspensions: Suspension[]; prevOwnerId: string | null;
  /** The office's 2026 sheet for this flat (before the CRM), for the paid / due figures on the dashboards. */
  sheet?: SheetSummary | null;
  /** On the project's Generator Charges List: billed on the "<type> + generator" rate card (e.g. Royal Enclave 15,000 instead of 12,000). */
  generator?: boolean;
  plan: Plan;               // billing plan the owner chose: monthly, quarterly or annual
  floor: string;            // e.g. LGF, GF (Oakwood); empty where the sheet has none
}

export interface BreakdownRow { label: string; short: string; sub?: string; amount: number }
export interface Breakdown { rows: BreakdownRow[]; dues: number; fee: number; feeBase: number; total: number }

export interface BillLine { label: string; amount: number; kind: 'maintenance' | 'discount' | 'utility' }
export interface Bill {
  id: string; ownerId: string; project: string; period: string; periodEnd: string; months: number;
  billDate: ISODate; dueDate: ISODate; finalDate: ISODate;
  amount: number; discount: number; extras: number; net: number; paid: number; fine: number; finePaid: number; fined: boolean;
  fromCredit: number; prev: number; noticeSkipped: boolean; flagSkipped: boolean; reminders: number[]; lines: BillLine[]; bd: Breakdown | null;
}

/** A utility bill (electricity, water…) entered by the accountant for one flat and month; goes on the next bill. */
export interface Charge {
  id: string; ownerId: string; project: string; period: string; kind: string; amount: number; units: number | null;
  note: string; by: string; d: ISODate; billId: string | null;
}
/** A maintenance notice sent by staff (water outage, electricity, lift…). */
export interface Notice {
  id: string; project: string; d: ISODate; t: string; kind: string; title: string; text: string; audience: string;
  count: number; failed: number; by: string;
}

export interface Entry { id: string; ownerId: string; project: string; d: ISODate; kind: string; amount: number; desc: string; ref: string | null; pid: string | null }

export interface SafepayLink { id: string; url: string; tracker: string | null; amount: number }
export interface PayLink {
  id: string; ownerId: string; project: string; amount: number; status: 'active' | 'paid' | 'cancelled'; created: ISODate;
  cancelledOn: ISODate | null; paidOn: ISODate | null; sp: SafepayLink | null; spSettled: boolean; spError: string | null;
}

// pending: waiting for the accountant to send it by hand on WhatsApp Web (automatic sending off).
export type MsgStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
export interface Message {
  id: string; ownerId: string; project: string; d: ISODate; t: string; from: 'biz' | 'owner';
  kind: string; title: string; text: string; tpl: string | null; vars: Record<string, string> | null;
  linkId: string | null; pdf: { kind: 'bill' | 'receipt' | 'statement'; id: string } | null;
  status: MsgStatus; waId: string | null; error: string | null; manual: boolean; shot: boolean; sentAt: string | null;
}

export interface Applied { kind: 'dues' | 'fee' | 'credit'; label: string; amount: number }
export interface Payment {
  id: string; ownerId: string; project: string; d: ISODate; t: string; amount: number; method: string; ref: string;
  source: 'link' | 'staff' | 'proof'; by: string; before: number; applied: Applied[]; balAfter: number; receipt: string;
  gateway: string | null; gwMode: 'live' | 'sandbox' | 'simulated' | null; linkId: string | null; spLink: string | null; spTracker: string | null;
}

export interface Proof { id: string; ownerId: string; project: string; d: ISODate; t: string; amount: number; status: 'pending' | 'verified' | 'rejected'; msgId: string | null; doneOn: ISODate | null; media: string | null }
export interface Alert { id: string; ownerId: string; project: string; d: ISODate; text: string; done: boolean }
export interface Clearance { no: string; ownerId: string; project: string; d: ISODate; by: string }
/** One flat's line on the office's yearly sheet: what it owed (arrears + the year's charges) and what was paid. */
export interface SheetSummary {
  asOf: ISODate; source: string; year: number;
  arrears: number; maintenance: number; electricity: number; discount: number; adjust: number; received: number; balance: number;
}
/** A WhatsApp message staff opened in WhatsApp Web, and what they answered when they came back ("Did you send it?"). */
export interface WaLog {
  id: string; project: string; ownerId: string | null; apt: string; ownerName: string; block: string;
  phone: string; sentTo: string; answer: 'sent' | 'not_sent'; via: 'prompt' | 'button';
  messageId: string | null; kind: string; title: string; text: string; amount: number; linkId: string | null; payUrl: string | null;
  staffId: string | null; staffName: string; staffRole: string; d: ISODate; t: string; at: string; test: boolean;
}
export interface LogEntry { id: string; project: string | null; d: ISODate; t: string; kind: string; text: string; ownerId: string | null;
  /** The staff member who did it (null for the system: daily run, webhooks, sending). */
  staffId?: string | null; by?: string | null }

export interface Template { key: string; label: string; status: 'approved' | 'pending'; text: string; pending: string | null; submittedOn: ISODate | null; metaName: string; pendingName?: string | null }

export interface TargetType { type: string; n: number; rate: number; sub: number }
export interface Target {
  p: string; total: number; gross: number; flats: number; disc: number; discN: number; discOn: number; discOnN: number;
  own: number; ownN: number; excluded: number; exOut: number; exOn: number; exOnN: number; types: TargetType[];
}

export interface ProjectSettings { project: string; rules: Rules; tgInc: { disc: string[]; exempt: string[] }; targets: Record<string, Target>; lastRun?: ISODate | null }

// Everything the engine and a project's screens need, loaded for one project.
export interface State {
  project: string; proj: Project; today: ISODate; goLive: ISODate; by: string; role: Role;
  /** Who is acting right now: their log entries carry it, so admins can see each person's activity. */
  staffId?: string | null; staffName?: string | null;
  rates: Rate[]; templates: Record<string, Template>; settings: ProjectSettings;
  owners: Owner[]; bills: Bill[]; entries: Entry[]; links: PayLink[]; messages: Message[]; payments: Payment[];
  proofs: Proof[]; alerts: Alert[]; clearances: Clearance[]; charges: Charge[]; notices: Notice[];
  company?: Company;
  log: LogEntry[];          // new entries only (written on save)
  seq: Record<string, number>;
}

/** Minawa's company details, printed on every bill, statement and receipt. */
export interface Company { legalName: string; address: string; ntn: string; phone: string; email: string }

export interface Staff { id: string; email: string; name: string; role: Role; active: boolean }
