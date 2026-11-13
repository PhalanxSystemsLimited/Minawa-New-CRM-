// The demo's sample data (three projects, two months of history), built by running the real engine day by day.
// Used to try the CRM without Minawa's data, and to check the screens against the demo.
import type { State, Owner, Rate, Project } from './types';
import { PROJECTS, TEMPLATES, SAMPLE_BANK, defaultSettings, RATE_CARDS, RATE_FROM } from './defaults';
import { use, seeding, runDaily, recordPayment, payLink, activeLink, ownerProof, verifyProof, billsOf, balance, unpaidMaint, log, nid, at } from './engine';
import { addDays, diff, fd } from './fmt';

export const SAMPLE_GO_LIVE = '2026-09-01';
export const SAMPLE_START = '2026-11-11';

type Row = [string, string, string, string, string, string, string, { pref?: string; discount?: Owner['discount']; abroad?: boolean; exempt?: boolean; director?: boolean; opening?: number; invalid?: boolean; plan?: Owner['plan'] }];
const SEED_CC: Row[] = [
  ['A-101','A','2-Bed','Hamza Qureshi','+92 300 555 0101','2023-03-05','prompt',{pref:'Card'}],
  ['A-102','A','2-Bed','Sana Malik','+92 301 555 0102','2022-11-17','late',{pref:'Card'}],
  ['A-103','A','2-Bed','Tariq Mehmood','+92 302 555 0103','2023-10-12','prompt',{pref:'Card',discount:{kind:'fixed',value:1000,until:'2027-06-30'},plan:'quarterly'}],
  ['A-201','A','3-Bed','Bilal Ahmed','+92 303 555 0201','2024-01-10','prompt',{pref:'Card'}],
  ['A-202','A','3-Bed','Mehwish Raza','+92 304 555 0202','2023-08-31','partial',{}],
  ['A-203','A','3-Bed','Lubna Sheikh','+44 7700 900203','2022-10-26','late',{pref:'Card',abroad:true}],
  ['A-301','A','3-Bed (D/L)','Imran Yousuf','+92 300 555 0301','2021-06-01','none',{exempt:true,director:true}],
  ['B-101','B','2-Bed','Usman Tariq','+92 305 555 1101','2024-05-02','defaulter',{opening:15000}],
  ['B-102','B','2-Bed','Fatima Noor','+92 306 555 1102','2023-06-21','prompt',{pref:'Card'}],
  ['B-103','B','2-Bed','Saima Akhtar','+92 307 555 1103','2024-08-29','defaulter',{}],
  ['B-201','B','3-Bed','Zain Abbasi','+92 308 555 1201','2022-09-14','advance',{plan:'annual'}],
  ['B-202','B','3-Bed','Hira Javed','+92 309 555 1202','2024-02-03','proof',{}],
  ['B-203','B','3-Bed','Adnan Butt','+92 310 555 1203','2024-06-07','prompt',{pref:'Card'}],
  ['B-301','B','3-Bed (D/L)','Omar Farooq','+92 311 555 1301','2023-12-08','prompt',{pref:'Card',discount:{kind:'pct',value:10,until:null}}],
  ['C-101','C','2-Bed','Amna Saleem','+92 312 555 2101','2024-07-19','promise',{opening:5000}],
  ['C-102','C','2-Bed','Faisal Iqbal','+92 300 12','2023-04-25','invalid',{invalid:true}],
  ['C-103','C','2-Bed','Junaid Aslam','+92 313 555 2103','2023-01-16','prompt',{pref:'Card'}],
  ['C-201','C','3-Bed','Rabia Khan','+92 314 555 2201','2022-12-03','prompt',{pref:'Card'}],
  ['C-202','C','3-Bed','Kamran Shah','+92 315 555 2202','2024-03-30','late',{pref:'Card'}],
  ['C-301','C','3-Bed (D/L)','Nadia Rehman','+92 316 555 2301','2021-06-01','none',{exempt:true,director:true}],
  ['C-302','C','3-Bed','Ahmed Nawaz','+92 317 555 2302','2026-10-18','prompt',{pref:'Card'}]
];
const SEED_PT: Row[] = [
  ['T-1201','Tower','2-Bed','Asad Iqbal','+92 300 555 3101','2022-04-08','prompt',{pref:'Card'}],
  ['T-1202','Tower','2-Bed','Rabia Khalid','+92 301 555 3102','2023-02-14','late',{}],
  ['T-1403','Tower','3-Bed','Kamran Haider','+92 302 555 3103','2021-09-21','prompt',{}],
  ['T-1404','Tower','3-Bed','Nida Farooq','+92 303 555 3104','2024-03-11','defaulter',{opening:12000}],
  ['T-1605','Tower','3-Bed','Shahid Mir','+92 304 555 3105','2022-12-03','partial',{}],
  ['T-1801','Tower','Penthouse','Ayesha Siddiqui','+92 305 555 3106','2020-07-19','prompt',{pref:'Card'}],
  ['T-1802','Tower','2-Bed','Hassan Raza','+92 306 555 3107','2023-10-27','late',{}],
  ['T-1903','Tower','3-Bed','Mariam Aslam','+92 307 555 3108','2024-06-15','prompt',{}]
];
const SEED_CL: Row[] = [
  ['CL-01','Clara','2-Bed','Faraz Ahmed','+92 308 555 4101','2023-05-06','prompt',{pref:'Card'}],
  ['CL-02','Clara','2-Bed','Sadia Imran','+92 309 555 4102','2022-08-17','late',{}],
  ['CL-03','Clara','3-Bed','Waqas Anwar','+92 310 555 4103','2024-01-23','defaulter',{}],
  ['CL-04','Clara','3-Bed','Hina Tariq','+92 311 555 4104','2021-11-30','prompt',{}],
  ['CL-05','Clara','2-Bed','Junaid Khan','+92 312 555 4105','2023-09-09','prompt',{}],
  ['CL-06','Clara','Penthouse','Sara Ali','+92 313 555 4106','2022-02-26','prompt',{discount:{kind:'pct',value:10,until:null}}]
];

export function blankOwner(p: Partial<Owner> & { id: string; project: string; apt: string }): Owner {
  return { unit: `${p.project}:${p.apt}`, block: '', type: '', name: '', phone: '', email: '', possession: '2000-01-01', possessionKnown: true,
    opening: 0, openingLeft: 0, credit: 0, feeDue: 0, exempt: false, exemptWhy: null, director: false, discount: null, abroad: false,
    invalidPhone: false, noPhone: false, rate: null, status: 'active', closedOn: null, flagged: false, flaggedOn: null, promiseUntil: null,
    notes: [], suspensions: [], prevOwnerId: null, plan: 'monthly', floor: '', generator: false, ...p };
}

export function freshState(proj: Project, today: string, rates: Rate[], seq: Record<string, number>): State {
  return { project: proj.id, proj, today, goLive: proj.goLive || today, by: 'System', role: 'admin', rates,
    templates: JSON.parse(JSON.stringify(TEMPLATES)), settings: defaultSettings(proj.id),
    owners: [], bills: [], entries: [], links: [], messages: [], payments: [], proofs: [], alerts: [], clearances: [], charges: [], notices: [], log: [], seq };
}

const sampleRates = (pid: string): Rate[] => pid === 'cc'
  ? RATE_CARDS.cc.map(r => ({ type: r.type, from: RATE_FROM, amount: r.amount, project: pid, id: `${pid}:${r.type}:${RATE_FROM}` }))
  : [
  { type: '2-Bed', from: '2026-01-01', amount: 5000 }, { type: '3-Bed', from: '2026-01-01', amount: 7500 }, { type: 'Penthouse', from: '2026-01-01', amount: 12000 },
  { type: '2-Bed', from: '2027-01-01', amount: 5500 }, { type: '3-Bed', from: '2027-01-01', amount: 8000 }, { type: 'Penthouse', from: '2027-01-01', amount: 13000 }
].map(r => ({ ...r, project: pid, id: `${pid}:${r.type}:${r.from}` }));

/** Builds the sample: returns the three live projects' states (sharing one id counter) as of SAMPLE_START. */
export function buildSample(): { projects: Project[]; states: State[]; seq: Record<string, number> } {
  const seq: Record<string, number> = {};
  const projects = PROJECTS.map(p => ({ ...p }));
  const states: State[] = [];
  const beh = new Map<string, Row[6]>(), pref = new Map<string, string>();
  for (const [pid, rows] of [['cc', SEED_CC], ['pt', SEED_PT], ['cl', SEED_CL]] as [string, Row[]][]) {
    const proj = projects.find(p => p.id === pid)!;
    Object.assign(proj, { live: true, goLive: SAMPLE_GO_LIVE, bank: SAMPLE_BANK });
    const S = freshState(proj, SAMPLE_GO_LIVE, sampleRates(pid), seq);
    use(S, () => {
      for (const r of rows) {
        const x = r[7];
        const o = blankOwner({ id: 'O' + nid('o'), project: pid, apt: r[0], block: r[1], type: r[2], name: r[3], phone: r[4],
          email: r[3].toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', possession: r[5], opening: x.opening || 0, openingLeft: x.opening || 0,
          exempt: !!x.exempt, director: !!x.director, discount: x.discount || null, abroad: !!x.abroad, invalidPhone: !!x.invalid, plan: x.plan || 'monthly' });
        S.owners.push(o); beh.set(o.id, r[6]); if (x.pref) pref.set(o.id, x.pref);
        if (o.opening) S.entries.push({ id: 'E' + nid('e'), ownerId: o.id, project: pid, d: SAMPLE_GO_LIVE, kind: 'opening', amount: o.opening, desc: 'Opening balance · unpaid dues from QuickBooks', ref: null, pid: null });
      }
    });
    states.push(S);
  }
  const cc = states[0];
  seeding(() => {
    use(cc, () => {
      log(SAMPLE_GO_LIVE, '09:00', 'job', `Go-live: ${states.reduce((s, x) => s + x.owners.length, 0)} owners in 3 projects and their opening balances imported from the QuickBooks Desktop export`);
      const zain = cc.owners.find(o => o.apt === 'B-201')!;
      recordPayment(zain, 45000, 'Bank deposit', 'DEP-77120', SAMPLE_GO_LIVE, 'staff', '09:40', 'Accountant');
      cc.owners.find(o => o.apt === 'B-101')!.notes.push({ d: '2026-09-20', by: 'Accountant', text: 'Called twice, no answer. Disputes the opening balance from QuickBooks.' });
      cc.owners.find(o => o.apt === 'C-102')!.notes.push({ d: '2026-09-26', by: 'Accountant', text: 'Number on file is not on WhatsApp. Need the correct number from the owner.' });
    });
    for (let d = SAMPLE_GO_LIVE; d <= SAMPLE_START; d = addDays(d, 1)) {
      for (const S of states) { S.today = d; use(S, () => { runDaily(d); behave(d, beh, pref); }); }
    }
  });
  for (const S of states) { S.today = SAMPLE_START; S.messages.forEach(m => { if (m.status === 'queued') m.status = 'read'; }); }
  return { projects, states, seq };
}

function behave(d: string, beh: Map<string, string>, pref: Map<string, string>) {
  const S = states();
  if (S.project === 'cc' && d.slice(8) === '20') {
    S.owners.filter(o => o.status === 'active' && !o.exempt && o.possession <= d).forEach((o, i) => {
      if (d.slice(0, 7) === '2026-11' && i % 4 === 3) return;   // a few still to enter this month
      const units = 60 + ((i * 37 + +d.slice(5, 7) * 11) % 120);
      S.charges.push({ id: 'CH' + nid('ch'), ownerId: o.id, project: 'cc', period: d.slice(0, 7), kind: 'Electricity', amount: units * 55, units, note: '', by: 'Accountant', d, billId: null });
    });
    log(d, '15:10', 'admin', `Electricity bills for ${d.slice(0, 7)} entered by Accountant`);
  }
  const payActive = (o: Owner, method: string, h: number) => { const l = activeLink(o); if (l) payLink(l, method, d, at(h)); };
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt) continue;
    const b0 = beh.get(o.id);
    for (const b of billsOf(o)) {
      const k = diff(d, b.billDate);
      if (b0 === 'prompt' && k === 2 && balance(o) > 0) payActive(o, pref.get(o.id) || 'Card', 13);
      if (b0 === 'late' && k === 17 && balance(o) > 0) payActive(o, pref.get(o.id) || 'Card', 16);
      if (b0 === 'promise' && b.billDate < '2026-10-01' && k === 17 && balance(o) > 0) payActive(o, 'Card', 16);
      if (b0 === 'partial' && k === 3 && unpaidMaint(b) > 0) recordPayment(o, Math.round(b.net / 2), 'Bank deposit', 'DEP-' + (78000 + nid('dep')), d, 'staff', at(11), 'Accountant');
      if (b0 === 'partial' && k === 16 && balance(o) > 0) payActive(o, 'Card', 15);
      if (b0 === 'proof' && k === 1 && balance(o) > 0) ownerProof(o, balance(o), d, at(18));
      if (b0 === 'proof' && k === 2) S.proofs.filter(p => p.ownerId === o.id && p.status === 'pending').forEach(p => verifyProof(p, d, at(10), 'Accountant'));
    }
    if (b0 === 'promise' && d === '2026-11-03') {
      o.promiseUntil = '2026-11-10';
      o.notes.push({ d, by: 'Accountant', text: 'Called. Promised to pay the full balance by 10 Nov, after salary.' });
      log(d, '12:10', 'job', `Promise to pay recorded for ${o.apt} until ${fd(o.promiseUntil)}. Notices paused`, o.id);
    }
    if (o.apt === 'B-101' && d === '2026-10-02') {
      o.suspensions.push({ service: 'Water supply', from: d, to: null, by: 'Admin' });
      log(d, '11:30', 'flag', `Water supply disconnection recorded for ${o.apt}`, o.id);
    }
  }
}
import { cur as states } from './engine';
