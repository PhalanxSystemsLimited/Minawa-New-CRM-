import type { Project, Template, ProjectSettings } from './types';
import { DEFAULT_RULES, normRules } from './types';

// Minawa's seven projects (minawagroup.pk/projects). `live` turns on once owners are imported.
export const PROJECTS: Project[] = [
  { id: 'pt', name: 'Park Towers', place: 'Islamabad', kind: 'Residential tower', live: false, goLive: null, bank: '' },
  { id: 're', name: 'The Royal Enclave', place: 'Islamabad', kind: 'Residential enclave', live: false, goLive: null, bank: '' },
  { id: 'cl', name: 'Clara Apartments', place: 'Islamabad', kind: 'Apartments', live: false, goLive: null, bank: '' },
  { id: 'cc', name: 'Country Club Apartments', place: 'Murree', kind: 'Apartments', live: false, goLive: null, bank: '' },
  { id: 'ow', name: 'Oakwood Apartments & Cottages', place: 'Bhurban', kind: 'Apartments and cottages', live: false, goLive: null, bank: '' },
  { id: 'tx', name: 'Taxila Satellite Township', place: 'Taxila', kind: 'Township', live: false, goLive: null, bank: '' },
  { id: 'wg', name: 'Wakefield Gardens', place: 'Khanpur', kind: 'Garden homes', live: false, goLive: null, bank: '' }
];

export const SAMPLE_BANK = 'Minawa Group – Maintenance · Sample Bank Ltd · IBAN PK00 SMPL 0000 0012 3456 7890';

// Message texts the CRM records for each kind of message (the history shows them). `metaName` is left over from
// the WhatsApp Business API, which isn't used: messages are sent by hand.
// Variables ({{name}}, {{total}}…) are filled in from the owner's figures.
export const TEMPLATES: Record<string, Template> = {
  bill: { key: 'bill', label: 'Bill', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_bill',
    text: 'Hi {{name}}, your maintenance bill for {{month}} (Apt {{apt}}) is {{amount}}.\n\nYour dues: {{breakdown}}\nDues: {{dues}}\nFine: {{fee}}\nTotal payable: {{total}}, due by {{due}}\n\nYour statement is attached. Tap Pay Now to pay by debit or credit card.' },
  notice: { key: 'notice', label: 'Disconnection notice', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_final_notice',
    text: 'Dear {{name}}, final notice for Apt {{apt}}.\n\nYour dues: {{breakdown}}\nDues: {{dues}}\nFine: {{fee}}\nTotal overdue: {{total}}\n\nPlease pay by {{final}}, or your utilities will be disconnected.' },
  reminder: { key: 'reminder', label: 'Reminder before the due date', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_reminder',
    text: 'Hi {{name}}, a reminder from Minawa Group: your maintenance for Apt {{apt}} is due on {{due}}.\n\nYour dues: {{breakdown}}\nTotal to pay: {{total}}\n\nTap Pay Now to pay by debit or credit card. Please ignore this if you have already paid.' },
  link: { key: 'link', label: 'Payment link', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_payment_link',
    text: 'Hi {{name}}, this is Minawa Group with your payment link for Apt {{apt}}.\n\nYour dues: {{breakdown}}\nDues: {{dues}}\nFine: {{fee}}\nTotal to pay: {{total}}\n\nTap Pay Now to pay by debit or credit card. The link is for this exact amount.' },
  receipt: { key: 'receipt', label: 'Receipt', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_receipt',
    text: 'Payment received: {{paid}} for Apt {{apt}} on {{date}}. Remaining balance: {{balance}}. Thank you. Your receipt is attached.' },
  credit: { key: 'credit', label: 'Bill paid from credit', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_bill_credit',
    text: 'Hi {{name}}, your {{month}} maintenance of {{amount}} for Apt {{apt}} was paid from your advance credit. Credit left: {{credit}}. Thank you.' },
  alert: { key: 'alert', label: 'Maintenance notice', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_maintenance_notice',
    text: 'Maintenance notice from Minawa Group, {{project}}:\n\n{{title}}\n{{text}}\n\nFor help, reply to this message.' },
  announce: { key: 'announce', label: 'Announcement', status: 'approved', pending: null, submittedOn: null, metaName: 'minawa_announcement',
    text: 'Dear resident, a message from Minawa Group:\n\n{{text}}\n\nThank you,\nMinawa Group' }
};
export const TEMPLATE_VARS: Record<string, string> = {
  bill: '{{name}} {{apt}} {{month}} {{amount}} {{breakdown}} {{dues}} {{fee}} {{total}} {{due}}',
  notice: '{{name}} {{apt}} {{breakdown}} {{dues}} {{fee}} {{total}} {{final}}',
  reminder: '{{name}} {{apt}} {{breakdown}} {{total}} {{due}}',
  link: '{{name}} {{apt}} {{breakdown}} {{dues}} {{fee}} {{total}}',
  receipt: '{{name}} {{apt}} {{paid}} {{date}} {{balance}}',
  credit: '{{name}} {{apt}} {{month}} {{amount}} {{credit}}',
  alert: '{{project}} {{title}} {{text}}',
  announce: '{{text}}'
};
export const SERVICES = ['Water supply', 'Lift access', 'Parking access'];

// Projects whose electricity (and other utility) bills the accountant enters each month.
export const UTILITY_PROJECTS: Record<string, string[]> = { cc: ['Electricity'], ow: ['Electricity'] };
export function defaultSettings(pid: string, saved?: Partial<ProjectSettings> | null): ProjectSettings {
  const base: ProjectSettings = { project: pid, rules: { ...DEFAULT_RULES, utilities: UTILITY_PROJECTS[pid] || [] }, tgInc: { disc: [], exempt: [] }, targets: {}, lastRun: null };
  const out = { ...base, ...(saved || {}) } as ProjectSettings;
  out.rules = normRules({ ...base.rules, ...((saved?.rules || {}) as object) });
  return out;
}
// Ready-made maintenance notices staff can start from (then edit before sending).
export const NOTICE_PRESETS: { key: string; label: string; title: string; text: string }[] = [
  { key: 'water', label: 'Water outage', title: 'Water supply interruption', text: 'Water supply to {{where}} will be off on {{when}} for {{reason}}. Please store water in advance. We are sorry for the inconvenience.' },
  { key: 'electricity', label: 'Electricity outage', title: 'Electricity interruption', text: 'Electricity to {{where}} will be off on {{when}} because of {{reason}}. The generator will cover lifts and common areas. We are sorry for the inconvenience.' },
  { key: 'lift', label: 'Lift maintenance', title: 'Lift maintenance', text: 'The lift in {{where}} will be out of service on {{when}} for scheduled maintenance. Please use the stairs or the other lift during this time.' },
  { key: 'gas', label: 'Gas supply', title: 'Gas supply interruption', text: 'Gas supply to {{where}} will be interrupted on {{when}} because of {{reason}}.' },
  { key: 'cleaning', label: 'Cleaning / fumigation', title: 'Cleaning and fumigation', text: 'Cleaning and fumigation of {{where}} is scheduled on {{when}}. Please keep windows closed and children and pets away from treated areas.' },
  { key: 'restored', label: 'Service restored', title: 'Service restored', text: 'The {{reason}} work in {{where}} is complete and the service is restored. Thank you for your patience.' },
  { key: 'custom', label: 'Custom message', title: 'Notice', text: '' }
];

// Minawa's 2026 rate cards (monthly, from the "Maintenance Charges Year 2026" sheets, dated 02.09.26).
// Country Club's sheet calls the double-level flats "3 Bed(D/L)"; the rate card calls them "4-Bed (D/L)": same type, Rs 10,000.
export const RATE_CARDS: Record<string, { type: string; amount: number }[]> = {
  cc: [{ type: '1-Bed', amount: 6000 }, { type: '2-Bed', amount: 8000 }, { type: '3-Bed', amount: 9000 }, { type: '3-Bed (D/L)', amount: 10000 }],
  ow: [{ type: '1-Bed', amount: 5000 }, { type: '2-Bed', amount: 6000 }, { type: 'Cottage', amount: 8000 }],
  re: [{ type: 'Apartment', amount: 12000 }, { type: 'Apartment + generator', amount: 15000 }]
};
export const RATE_FROM = '2026-01-01';
/** The many ways the sheets write a flat type, to one name per rate card. */
export function normType(raw: string): string {
  const s = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  if (/d\/?l|double/.test(s)) return '3-Bed (D/L)';
  if (/cottage/.test(s)) return 'Cottage';
  if (/studio|^1-?bed/.test(s)) return '1-Bed';
  const m = s.match(/^(\d)-?bed/); if (m) return `${m[1]}-Bed`;
  if (/apart|flat/.test(s)) return 'Apartment';
  return raw.trim();
}
