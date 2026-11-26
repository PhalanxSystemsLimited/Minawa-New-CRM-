// Data model. One shape is used everywhere: the billing engine, the screens, and both stores (Supabase and the
// local file store). It mirrors the demo's state, so the engine logic carries over line for line.

export type Role = 'admin' | 'accountant' | 'manager';
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
  billDay: number;          // billing day of customers with no possession date on file (25)
  dueDays: number;          // every bill is due on this day of the month after the bill (15)
  remindOn: number[];       // more reminders on these days of the due date's month, while the bill is unpaid ([3, 7])
  /** New customers (possessions recorded in the CRM) get their first bill this many days after possession (25). */
  graceDays: number;
  /** The day the CRM starts: every customer with a balance gets a statement, due on the dueDays of the next month.
   *  Monthly charges start in the project's go-live month (Project.goLive). Empty: the go-live month's billing day. */
  startOn: ISODate | null;
  feePct: number;           // fine, % of the unpaid bills (and old arrears if fineArrears) while a bill is overdue; set by accountants (10)
  flagDays: number;         // flag for disconnection this many days after the due date (15)
  sendHour: number;         // hour (PKT) the daily run goes out (11)
  utilities: string[];      // utility bills entered each month for this project, e.g. ['Electricity']
  /** Fine old arrears (opening balances from before go-live) too. Off: the fine is only on the system's own bills. */
  fineArrears: boolean;
  /** Phase 2 (18 Nov 2026): the bill (and the building manager's "send bill" To do) is made this many days before each
   *  due date (15), and the late-payment warning this many days after it if still unpaid (15). */
  billLead: number; warnAfter: number;
  /** Electricity (21 Nov 2026). 'bill': entered from the paper bill (Oakwood); 'meter': sub-meters, units used x the
   *  Admin's unit rate (Country Club). Reading day of the month, due N days after the bill, reminder days relative to
   *  the due date (negative = before), and the late-fine steps (from N days late, P% of the unpaid bill). */
  elecMode?: 'bill' | 'meter'; elecReadDay?: number; elecDueDays?: number; elecRemind?: number[]; elecFine?: { days: number; pct: number }[];
}
export const DEFAULT_RULES: Rules = { billDay: 25, dueDays: 15, remindOn: [3, 7], feePct: 10, flagDays: 15, sendHour: 11, utilities: [], fineArrears: false, graceDays: 25, startOn: null, billLead: 16, warnAfter: 15 };
export function normRules(r: Partial<Rules> & Record<string, unknown>): Rules {
  const x = { ...DEFAULT_RULES, ...r } as Rules & { autoSend?: unknown };
  delete x.autoSend;   // from before: WhatsApp is only sent by hand now
  // Reminders used to be "days before the due date" (remindDays); now they are days of the month (3rd and 7th).
  delete (x as { remindDays?: unknown }).remindDays;
  if (!Array.isArray(x.remindOn)) x.remindOn = [...DEFAULT_RULES.remindOn];
  x.remindOn = [...new Set(x.remindOn.map(Number).filter(n => n >= 1 && n <= 28))].sort((a, b) => a - b);
  if (!Array.isArray(x.utilities)) x.utilities = [];
  x.fineArrears = x.fineArrears === true;
  x.graceDays = Math.max(0, Math.min(60, Math.round(+x.graceDays))); if (!Number.isFinite(x.graceDays)) x.graceDays = DEFAULT_RULES.graceDays;
  x.dueDays = Math.max(1, Math.min(28, Math.round(+x.dueDays) || DEFAULT_RULES.dueDays));
  x.billLead = Math.max(1, Math.min(60, Math.round(+x.billLead) || DEFAULT_RULES.billLead));
  x.warnAfter = Math.max(1, Math.min(60, Math.round(+x.warnAfter) || DEFAULT_RULES.warnAfter));
  x.startOn = typeof x.startOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.startOn) ? x.startOn : null;
  return x;
}
export type Plan = 'monthly' | 'quarterly' | 'sixmonthly' | 'annual';
export const PLAN_MONTHS: Record<Plan, number> = { monthly: 1, quarterly: 3, sixmonthly: 6, annual: 12 };
export const PLAN_LABEL: Record<Plan, string> = { monthly: 'Monthly', quarterly: 'Quarterly', sixmonthly: 'Every 6 months', annual: 'Yearly' };
/** Plans offered for new possessions (quarterly stays only for customers already on it). */
export const NEW_PLANS: Plan[] = ['monthly', 'sixmonthly', 'annual'];
export const isPlan = (x: unknown): x is Plan => typeof x === 'string' && x in PLAN_MONTHS;

export interface Discount { kind: 'pct' | 'fixed'; value: number; until: ISODate | null }
export interface Note { d: ISODate; by: string; text: string }
export interface Suspension { service: string; from: ISODate; to: ISODate | null; by: string }

export interface Owner {
  id: string; project: string; unit: string; apt: string; block: string; type: string;
  name: string; phone: string; email: string;
  possession: ISODate; possessionKnown: boolean;
  /** New customers only (possessions recorded in the CRM): the first bill date, possession + graceDays. It sets the billing day. */
  firstBill?: ISODate | null;
  /** Meter readings (Phase 3, Oakwood electricity): at possession and when the customer leaves. */
  meterIn?: Reading | null; meterOut?: Reading | null;
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
  /** An approved instalment plan for this owner's old arrears (openingLeft). */
  instalments?: InstalmentPlan | null;
  /** Their own due day (day of the month after the bill), approved by an Admin; null = the project's rule. */
  dueDay?: number | null;
  floor: string;            // e.g. LGF, GF (Oakwood); empty where the sheet has none
  /** 21 Nov 2026: the customer's ID (building code + number, e.g. CC-00012) and their CNIC details. */
  customerId?: string | null; cnic?: string | null; cnicExpiry?: ISODate | null; cnicAddress?: string | null;
}

/** A flat the Admin added in Settings (one that has never had a customer in the CRM). Flats that have had a customer
 *  are known from their customer records. */
export interface FlatDef { apt: string; block: string; floor: string; type: string; d: ISODate; by: string;
  /** The maintenance billing plan a new customer starts on (they can still choose another at possession). */
  plan?: Plan | null; note?: string | null; editedBy?: string | null; editedD?: ISODate | null }

/** Old arrears split into parts, each with its own due date. Payments still go to old arrears first (one balance,
 *  never counted twice); a part is paid once the arrears have come down by the parts before it plus itself. */
export interface InstalmentPlan { id: string; approvedD: ISODate; startLeft: number; total: number; items: { amount: number; due: ISODate }[]; by: string }

export interface BreakdownRow { label: string; short: string; sub?: string; amount: number }
export interface Breakdown { rows: BreakdownRow[]; dues: number; fee: number; feeBase: number; total: number }

export interface BillLine { label: string; amount: number; kind: 'maintenance' | 'generator' | 'discount' | 'utility' | 'correction' }
export interface Bill {
  id: string; ownerId: string; project: string; period: string; periodEnd: string; months: number;
  billDate: ISODate; dueDate: ISODate; finalDate: ISODate;
  amount: number; discount: number; extras: number; net: number; paid: number; fine: number; finePaid: number; fined: boolean;
  fromCredit: number; prev: number; noticeSkipped: boolean; flagSkipped: boolean; reminders: number[]; lines: BillLine[]; bd: Breakdown | null;
  /** Phase 2: the days this bill covers (possession day to the day before its due date). finalDate = the late-warning date. */
  covFrom?: ISODate | null; covTo?: ISODate | null;
  /** Electricity bills (21 Nov 2026): the photo of the bill the building manager took; printed on the bill PDF. */
  photoId?: string | null;
}

/** A utility bill (electricity, water…) entered by the accountant for one flat and month; goes on the next bill. */
export interface Charge {
  id: string; ownerId: string; project: string; period: string; kind: string; amount: number; units: number | null;
  note: string; by: string; d: ISODate; billId: string | null;
  /** Electricity (Phase 3): the meter readings this bill is for. */
  prevReading?: number | null; curReading?: number | null;
}
/** A meter reading on a date: at possession (move-in) and when the customer leaves. */
export interface Reading { d: ISODate; reading: number }
/** A maintenance notice sent by staff (water outage, electricity, lift…). */
export interface Notice {
  id: string; project: string; d: ISODate; t: string; kind: string; title: string; text: string; audience: string;
  count: number; failed: number; by: string;
}

export interface Entry { id: string; ownerId: string; project: string; d: ISODate; kind: string; amount: number; desc: string; ref: string | null; pid: string | null }

// pending: waiting for the accountant to send it by hand on WhatsApp Web (automatic sending off).
export type MsgStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
export interface Message {
  id: string; ownerId: string; project: string; d: ISODate; t: string; from: 'biz' | 'owner';
  kind: string; title: string; text: string; tpl: string | null; vars: Record<string, string> | null;
  pdf: { kind: 'bill' | 'receipt' | 'statement'; id: string } | null;
  status: MsgStatus; waId: string | null; error: string | null; manual: boolean; shot: boolean; sentAt: string | null;
}

/** What a payment paid. ref: the bill id, 'arrears', 'fee' or 'credit' (so a payment can be reversed exactly). */
export interface Applied { kind: 'dues' | 'fee' | 'credit'; label: string; amount: number; ref?: string }
export interface Payment {
  id: string; ownerId: string; project: string; d: ISODate; t: string; amount: number; method: string; ref: string;
  /** staff: entered by staff; proof: a checked bank screenshot or a building manager's entry. ('link' only on old records.) */
  source: 'link' | 'staff' | 'proof'; by: string; before: number; applied: Applied[]; balAfter: number; receipt: string;
  /** Who is holding the cash: the building manager who took it, or the Accountant for cash paid at the office. */
  collectorId?: string | null; collectorName?: string | null;
  /** The cash hand-over it went in (payments are cash only: building manager → Accountant → bank). */
  handoverId?: string | null;
  /** A wrong payment taken back: when, by whom and why. Reversed payments stay in the database for the record. */
  reversed?: { d: ISODate; t: string; by: string; reason: string } | null;
  /** 18 Nov 2026: who entered it, who approved it and when; a bank transfer's transaction ID. */
  enteredBy?: string | null; approvedBy?: string | null; approvedAt?: string | null; txn?: string | null;
  /** What the payment is for: maintenance (default) or electricity (Oakwood: paid against electricity bills first). */
  forWhat?: 'maintenance' | 'electricity' | null;
  /** 19 Nov 2026: the building manager's entry this payment came from (it counts, with its receipt, from the moment of
   *  entry; the entry stays open until the Accountant approves it, which only confirms the money reached him). */
  entryId?: string | null;
  /** 21 Nov 2026: the photo of the bank transfer (or bill receipt) taken at entry, and the electricity bill it paid. */
  photoId?: string | null; billId?: string | null;
  /** 26 Nov 2026: the months this payment is for ('YYYY-MM'), picked by the building manager; shown on the receipt. */
  periodFrom?: string | null; periodTo?: string | null;
}
/** Cash a building manager hands over to the Accountant (or cash paid at the office), followed to the bank deposit. */
export interface Handover {
  id: string; project: string; fromId: string | null; fromName: string; amount: number; paymentIds: string[];
  d: ISODate; t: string; status: 'pending' | 'received' | 'disputed';
  receivedBy: string | null; receivedD: ISODate | null; note: string | null; reply: string | null;
  depositSlip: string | null; depositD: ISODate | null; depositedBy: string | null;
}

/** Money waiting for an accountant to check: a bank-transfer screenshot an owner sent (`transfer`), or a payment a
 *  building manager entered (`cash`, cash or bank transfer). Since 19 Nov 2026 a manager's entry is recorded as a payment
 *  at once (balance, receipt to send); the Accountant's approval confirms the money reached him, and "not received"
 *  takes the payment back. Older entries (no payId) still count only once approved. */
export interface Proof { id: string; ownerId: string; project: string; d: ISODate; t: string; amount: number; status: 'pending' | 'verified' | 'rejected' | 'cancelled'; msgId: string | null; doneOn: ISODate | null; media: string | null;
  kind?: 'transfer' | 'cash'; method?: string | null; ref?: string | null; note?: string | null; byId?: string | null; byName?: string | null; paidOn?: ISODate | null; checkedBy?: string | null; reply?: string | null;
  /** A bank transfer's transaction ID (method 'Bank transfer'). */
  txn?: string | null; forWhat?: 'maintenance' | 'electricity' | null;
  /** The payment recorded when the entry was made (19 Nov 2026). */
  payId?: string | null;
  /** 21 Nov 2026: the photo taken at entry (bank transfer screen or bill receipt), and the electricity bill it is for. */
  photoId?: string | null; billId?: string | null;
  /** 26 Nov 2026: the months the payment is for ('YYYY-MM'), from the accountant's payment request. */
  periodFrom?: string | null; periodTo?: string | null;
  /** 26 Nov 2026: the accountant's payment request this entry answers (its receipt goes out once approved). */
  requestId?: string | null }
/** A payment request (26 Nov 2026): the accountant asks a building manager to collect an amount from a customer, by
 *  cash or bank transfer, for the months given. The building manager answers it with an entry (the cash book number
 *  he wrote by hand, or the transfer's ID and photo); the accountant approves the entry and sends the receipt. */
export interface PayRequest {
  id: string; project: string; ownerId: string; amount: number; method: 'Cash' | 'Bank transfer';
  periodFrom: string; periodTo: string; forWhat: 'maintenance' | 'electricity' | null; note: string | null;
  managerId: string; managerName: string; byId: string | null; byName: string; d: ISODate; t: string;
  /** open: waiting for the building manager · entered: he made the entry (see proofId) · cancelled by the accountant. */
  status: 'open' | 'entered' | 'cancelled'; proofId: string | null; doneD: ISODate | null; doneT: string | null;
  /** Why it was cancelled, or why it came back (the accountant didn't receive the money). */
  reply: string | null }
/** A photo stored for the CRM (21 Nov 2026): in Cloudinary (private), with its link kept in Supabase. Staff open it
 *  through the CRM; a customer only sees the photo printed on their own bill. */
export interface ImageRec {
  id: string; project: string; ownerId: string | null; kind: 'payment' | 'bill'; refId: string | null;
  /** Where it is: the Cloudinary link (private, signed), or local:<file> on a laptop copy. */
  url: string; publicId: string; format: string; bytes: number; width: number; height: number;
  byId: string | null; byName: string; at: string;
}
/** Something a building manager has to follow up: a broken promise to pay, or (kind 'entry') a payment the Accountant
 *  did not receive, already taken back, to put right with the customer. */
export interface Alert { id: string; ownerId: string; project: string; d: ISODate; text: string; done: boolean; kind?: 'promise' | 'entry' | null }
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
  messageId: string | null; kind: string; title: string; text: string; amount: number;
  staffId: string | null; staffName: string; staffRole: string; d: ISODate; t: string; at: string; test: boolean;
  /** The staff member's WhatsApp number the chat was opened from (20 Nov 2026). */
  fromNumber?: string | null;
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

export interface ProjectSettings { project: string; rules: Rules; tgInc: { disc: string[]; exempt: string[] }; targets: Record<string, Target>; lastRun?: ISODate | null;
  /** The building's flats added by the Admin (21 Nov 2026), for New possession's flat list. */
  flats?: FlatDef[] }

// Everything the engine and a project's screens need, loaded for one project.
export interface State {
  project: string; proj: Project; today: ISODate; goLive: ISODate; by: string; role: Role;
  /** Who is acting right now: their log entries carry it, so admins can see each person's activity. */
  staffId?: string | null; staffName?: string | null;
  rates: Rate[]; templates: Record<string, Template>; settings: ProjectSettings;
  owners: Owner[]; bills: Bill[]; entries: Entry[]; messages: Message[]; payments: Payment[]; handovers: Handover[];
  proofs: Proof[]; alerts: Alert[]; clearances: Clearance[]; charges: Charge[]; notices: Notice[];
  /** 26 Nov 2026: payment requests from the accountant to the building managers. */
  requests: PayRequest[];
  /** Changes to an owner's charges that an accountant asked for, waiting for (or decided by) an admin. */
  approvals: Approval[];
  company?: Company;
  /** Screens only (not saved): when the signed-in person last opened Payments here, for the "new payments" badge. */
  paySeen?: string | null;
  /** Screens only (not saved): the page a customer's windows return to after saving (the customer's page). */
  viewBase?: string | null;
  /** Names of the building managers assigned to this project (for screens only, not saved). */
  managers?: string[];
  log: LogEntry[];          // new entries only (written on save)
  seq: Record<string, number>;
}

/** A change asked for by an accountant. It only applies once an admin approves it.
 *  For one owner: discount: { kind: 'pct' | 'fixed' | 'none', value, until } · generator: { on } · plan: { plan } ·
 *  rate: { rate } (null = rate card) · adjust: { kind: 'charge' | 'credit', amount, reason }.
 *  For the whole project (ownerId null): rates: { from, rates: { type: amount } } · rules: the billing schedule fields ·
 *  fine: { feePct, fineArrears, apply, send } · announce: { aud, text }. */
export type ApprovalKind = 'discount' | 'generator' | 'plan' | 'rate' | 'adjust' | 'rates' | 'rules' | 'fine' | 'announce' | 'possession' | 'instalments' | 'due' | 'posdate' | 'reverse' | 'discontinue' | 'leave' | 'elecfine' | 'apttype';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'changes';
export interface Approval {
  id: string; project: string; ownerId: string | null; kind: ApprovalKind; change: Record<string, unknown>;
  /** What will change ("10% discount until 31 Dec 2026") and what it is now ("No discount"). */
  summary: string; before: string; note: string;
  byId: string | null; byName: string; d: ISODate; t: string;
  status: ApprovalStatus; decidedById: string | null; decidedByName: string | null; decidedD: ISODate | null; decidedT: string | null; reply: string | null;
  /** Undo (21 Nov 2026): for an approved rate, rate-card, discount or plan change, what it was before and how many
   *  bills there were, so the Admin can put it back within 7 days if no bill has used it yet. */
  undo?: { prev: Record<string, unknown>; bills: number; doneD?: ISODate | null; doneBy?: string | null } | null;
}

/** Minawa's company details, printed on every bill, statement and receipt. */
export interface Company { legalName: string; address: string; ntn: string; phone: string; email: string }

/** `projects`: for a building manager, the buildings (project ids) they may open; the Admin assigns them. */
export interface Staff { id: string; email: string; name: string; role: Role; active: boolean; projects?: string[];
  /** 20 Nov 2026: the WhatsApp numbers this person sends from (set by the Admin), each with its own daily limit. */
  waNumbers?: WaNumber[] | null;
  /** 21 Nov 2026: employee ID (EMP-0001), phone and CNIC details. */
  staffNo?: string | null; phone?: string | null; cnic?: string | null; cnicExpiry?: string | null; cnicAddress?: string | null;
  /** 24 Nov 2026: a past employee (deleted by the Admin): their last working day, why, and who recorded it. They can't sign in. */
  leftOn?: string | null; leftReason?: string | null; leftBy?: string | null;
  /** 25 Nov 2026: a building manager's accountant (staff id), set by the Admin. Kept as the first of accountantIds. */
  reportsTo?: string | null;
  /** 26 Nov 2026: the accountants a building manager reports to (one or more), set by the Admin. Each sees his managers'
   *  buildings and approves their payments; their desk work (bills, reminders, notices) is theirs. */
  accountantIds?: string[] | null }
/** A WhatsApp number staff send from. The limit counts different customers in any 24 hours, per number (a number on
 *  two people's details has one count). */
export interface WaNumber { id: string; number: string; label: 'Personal' | 'Company'; limit: number; active: boolean }
/** One sending number's use in the last 24 hours. */
export interface WaUse { number: string; used: number; limit: number; extra: number; nextFree: string | null }
export interface WaTake { ok: boolean; repeat?: boolean; used: number; limit: number; nextFree?: string | null }
