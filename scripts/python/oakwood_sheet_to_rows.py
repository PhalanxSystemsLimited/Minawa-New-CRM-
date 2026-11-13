# Oakwood yearly sheet (.xls) -> import rows (JSON) for the CRM. Usage: python oakwood_sheet_to_rows.py "OAKWOOD MAINTENANCE 2026.xls" oakwood-rows.json
# Checks every row (maintenance + arrears + electricity = total; total - received = balance) and prints section totals.
import xlrd, re, json, sys
wb = xlrd.open_workbook(sys.argv[1])
def num(v):
    if v in ('', None): return 0
    return int(round(float(v)))
def floor_of(s):
    m = re.search(r'\(([^)]*)\)', s); f = (m.group(1) if m else '').upper().replace('.', '').replace(' ', '')
    return f
def phone(raw):
    s = str(raw).strip()
    if s.endswith('.0'): s = s[:-2]
    d = re.sub(r'\D', '', s)
    if not d: return '', None
    if d.startswith('00'): d = d[2:]
    if d.startswith('0') and len(d) == 11: d = '92' + d[1:]
    if len(d) == 10 and d.startswith('3'): d = '92' + d
    if re.fullmatch(r'923\d{9}', d): return '+' + d, None
    return '', f'Contact number on the sheet "{str(raw).strip()}" is not a valid mobile number, so WhatsApp is off until it is corrected'
TYPE = {'A': '1-Bed', 'C': '2-Bed', 'D': '2-Bed', 'E': '2-Bed', 'F': '2-Bed', 'G': '2-Bed', 'COT': 'Cottage'}
CARD = {'1-Bed': 5000, '2-Bed': 6000, 'Cottage': 8000}
# Ownership transfers to note on the flat, e.g. {'E-4 (TF)': 'Transferred on 29 Jul 2026 from … to …'}. Kept empty in git (residents' names).
TRANSFERS: dict = {}
rows, problems, totals = [], [], {}
def add(section, r, apt, block, cells):
    sr, aptraw, name, maint, arr, elec, tot, rec, bal, cont = cells
    t = TYPE[block if block in TYPE else 'COT']
    m, a, e, T, R, B = num(maint), num(arr), num(elec), num(tot), num(rec), num(bal)
    if m + a + e != T: problems.append(f'{apt}: maintenance+arrears+electricity {m+a+e} != total {T}')
    if T - R != B: problems.append(f'{apt}: total-received {T-R} != balance {B}')
    ph, pnote = phone(cont)
    notes = [f'Oakwood sheet as on 11.11.2026: maintenance 2026 Rs {m:,}, arrears Rs {a:,}, electricity Rs {e:,}, received Rs {R:,}, balance Rs {B:,}']
    if m != 12 * CARD[t]: notes.append(f'The sheet charged Rs {m:,} maintenance for 2026 (the {t} rate is Rs {12*CARD[t]:,} a year); billed at the {t} rate from Jan 2027')
    if pnote: notes.append(pnote)
    if apt in TRANSFERS: notes.append(TRANSFERS[apt])
    rows.append(dict(apt=apt, block=block if block != 'COT' else 'Cottages', type=t, name=re.sub(r'\s+', ' ', str(name)).strip(), phone=ph, email='', possession=None,
        opening=B, rate=None, yearly=None, discount=0, exempt=False, director=False, notes=notes, plan='monthly', floor=floor_of(aptraw) if block != 'COT' else '', line=r + 1))
    totals[section] = totals.get(section, 0) + B
sh = wb.sheet_by_name('Block "A"')
for r in range(sh.nrows):
    c = [sh.cell_value(r, i) for i in range(10)]
    if not isinstance(c[0], float) or not str(c[1]).strip(): continue
    n = re.match(r'\s*(\d+)', str(c[1])).group(1)
    add('A', r, f'A-{n} ({floor_of(str(c[1]))})', 'A', c)
sh = wb.sheet_by_name('Blk C, G')
for r in range(sh.nrows):
    c = [sh.cell_value(r, i) for i in range(10)]
    if not isinstance(c[0], float): continue
    raw = str(c[1]).strip()
    if isinstance(c[1], float):  # cottages: plain numbers
        n = int(c[1]); add('Cottages', r, f'Cottage {n}', 'COT', c); continue
    m = re.match(r'\s*(\d+)\s*-\s*([A-G])', raw)
    add('C-G', r, f'{m.group(2)}-{m.group(1)} ({floor_of(raw)})', m.group(2), c)
apts = [x['apt'] for x in rows]
dups = {a for a in apts if apts.count(a) > 1}
print('rows', len(rows), 'dups', dups)
print('section totals', totals, 'sum', sum(totals.values()))
print('problems', problems)
print('no phone', [(x['apt']) for x in rows if not x['phone']])
print('credit', [(x['apt'], x['opening']) for x in rows if x['opening'] < 0], 'zero', [x['apt'] for x in rows if x['opening'] == 0])
from collections import Counter; print(Counter(x['type'] for x in rows), Counter(x['block'] for x in rows))
json.dump(rows, open(sys.argv[2], 'w'), indent=1)
