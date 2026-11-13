"""Import the accountant's yearly maintenance sheet (ICCA Maintenance Charges .xls) into clean owner records.

    python scripts/import_maintenance_xls.py "ICCA Maintenance Charges Jan-26-Dec-26 -Todate.xls" [--first-month 2026-11]

Writes, into data/ (git-ignored, never published):
  data/owners-real.json    one record per apartment, with the opening balance for the new system
  data/cleanup-report.csv  every problem found, row by row, for the accountant to fix (opens in Excel)
Prints only counts and totals, never owners' names.

How the sheet works: one row per apartment with arrears up to Dec 2025, the whole of 2026 charged up front,
any discount, what was received in 2026, and the balance. The new system bills monthly from --first-month,
so those months come out of the opening balance (and the new system bills them instead):
  opening balance = sheet balance - (monthly rate - monthly discount) x months the new system will bill in 2026
which keeps  opening balances + new 2026 bills = the sheet's balance total, rupee for rupee.
"""
import argparse
import csv
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
SHEETS = ("A BLOCK", "AA BLOCK")  # "Sheet1" is an old "Till-Dec-2023" scratch list
# Minawa's rate card (confirmed 2026-11-05). The sheet's "1 Bed" flats are studios; "D/L" means double level.
TYPE_NAMES = {"1": "Studio", "2": "2-Bed", "3": "3-Bed", "3D": "3-Bed Double Level"}
RATE_CARD = {"Studio": 6000, "2-Bed": 8000, "3-Bed": 9000, "3-Bed Double Level": 10000}
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def num(v):
    if v in ("", None):
        return 0
    if isinstance(v, (int, float)):
        return round(v)
    s = str(v).replace(",", "").strip()
    try:
        return round(float(s))
    except ValueError:
        return None


def norm_type(raw):
    s = str(raw).lower().replace(" ", "")
    m = re.match(r"(\d)-?bed(\(?d/?l\)?)?", s)
    if not m:
        return None
    return TYPE_NAMES["3D" if m.group(2) and m.group(1) == "3" else m.group(1)]


def parse_possession(cell, datemode):
    """Returns (iso date or None, tags, problem or None)."""
    tags = []
    if cell.ctype == xlrd.XL_CELL_DATE:
        return xlrd.xldate_as_datetime(cell.value, datemode).date().isoformat(), tags, None
    v = cell.value
    if v in ("", None) or (isinstance(v, float) and v == 0):
        return None, tags, "No possession date"
    s = str(v).strip()
    if re.search(r"bahria", s, re.I):
        return None, ["Rented to Bahria"], "No possession date (says Bahria Rent)"
    if re.search(r"tfr", s, re.I):
        tags.append("Transferred")
        s = re.sub(r"\(?tfr\)?", "", s, flags=re.I).strip()
    m = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", s)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, d).isoformat(), tags, None
        except ValueError:
            return None, tags, f"Possession date '{v}' is not a real date"
    m = re.fullmatch(r"([A-Za-z]{3})[a-z]*[-\s.](\d{2,4})", s)
    if m and m.group(1).lower() in MONTHS:
        y = int(m.group(2)); y += 2000 if y < 100 else 0
        return dt.date(y, MONTHS[m.group(1).lower()], 1).isoformat(), tags, f"Possession date '{v}' has no day; the 1st is assumed"
    return None, tags, f"Possession date '{v}' can't be read"


def norm_apt(raw, block):
    """'13/a(AA)' -> '13A-AA', '02-A' -> '2-A', 6.0 in block AA -> '6-AA'. Returns (label, problem or None)."""
    s = str(int(raw)) if isinstance(raw, float) else str(raw)
    s = s.upper().replace(" ", "")
    m = re.fullmatch(r"0*(\d+)/?([A-Z]?)(?:[-(]([A-Z]{1,2})\)?)?", s)
    if not m:
        return s, f"Apartment number '{raw}' doesn't follow the usual pattern"
    n, letter, blk = m.groups()
    if blk and blk != block:
        return s, f"Apartment number '{raw}' names block {blk}, but it is listed under block {block}"
    return f"{int(n)}{letter}-{block}", None


def clean_name(raw):
    s = re.sub(r"\s+", " ", str(raw)).strip()
    notes = [x.strip() for x in re.findall(r"\(([^)]*)\)", s)]
    s = re.sub(r"\s*\([^)]*\)", "", s).strip()
    if re.search(r"\brented\b", s, re.I):
        notes.append("Rented")
        s = re.sub(r"\s*\brented\b", "", s, flags=re.I).strip()
    return s, notes


def read_sheet(sh, datemode):
    hdr = [" ".join(str(sh.cell_value(r, c)).strip().lower() for r in (2, 3)) for c in range(sh.ncols)]
    col = {}
    for c, h in enumerate(hdr):
        for key, pat in (("apt", r"^apt no"), ("type", r"^apt type"), ("name", r"client"), ("possession", r"possession"),
                         ("arrears", r"arear|arrear"), ("maint", r"maintenance"), ("discount", r"discount"),
                         ("adjust", r"adjustment"), ("received", r"received"), ("balance", r"balance")):
            if key not in col and re.search(pat, h):
                col[key] = c
    missing = {"apt", "type", "name", "possession", "arrears", "maint", "received", "balance"} - set(col)
    if missing:
        sys.exit(f"Sheet {sh.name}: can't find columns {sorted(missing)}")
    rows, totals, block, series = [], None, None, None
    for r in range(4, sh.nrows):
        cells = sh.row(r)
        first = str(cells[0].value).strip().upper()
        apt = cells[col["apt"]].value
        label = str(cells[col["name"]].value).strip()
        if first.startswith("TOTAL"):
            totals = {k: num(cells[col[k]].value) or 0 for k in ("arrears", "maint", "discount", "adjust", "received", "balance") if k in col}
            continue
        if str(apt).strip() == "":
            m = re.search(r'block\s*"?\s*([A-Z]{1,2})\b"?', label, re.I)
            if m:
                block = m.group(1).upper()
                t = re.search(r"([A-Z])\s*-\s*type", label, re.I)
                series = f"{t.group(1).upper()}-Type" if t else None
            continue
        rows.append({"sheet": sh.name, "row": r + 1, "block": block, "series": series, "cells": cells, "col": col})
    return rows, totals, hdr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xls")
    ap.add_argument("--first-month", default="2026-11", help="first month the new system bills (YYYY-MM)")
    a = ap.parse_args()
    y0, m0 = (int(x) for x in a.first_month.split("-"))
    future_months = 13 - m0 if y0 == 2026 else 0  # 2026 months the new system bills itself

    book = xlrd.open_workbook(a.xls)
    issues, owners, recon = [], [], {}
    as_of = None
    raw_rows = []
    for name in SHEETS:
        sh = book.sheet_by_name(name)
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{2})", str(sh.cell_value(1, 0)))
        if m and not as_of:
            as_of = dt.date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        rows, totals, hdr = read_sheet(sh, book.datemode)
        if any("upto dec-2026" in h for h in hdr):
            issues.append(("Fix", name, 4, "", "", "", "Header typo", "The arrears column says 'Upto Dec-2026'; the figures are arrears up to Dec 2025."))
        recon[name] = {"rows": rows, "totals": totals}
        raw_rows += rows
        for r in range(sh.nrows):  # notes like "Maintinance List should be 207"
            for v in sh.row_values(r):
                m = re.search(r"should be\s*(\d+)", str(v), re.I)
                if m:
                    recon[name]["expected"] = (int(m.group(1)), r + 1)
    other = [s.name for s in book.sheets() if s.name not in SHEETS]
    for s in other:
        issues.append(("Info", s, "", "", "", "", "Sheet not imported", f"'{s}' looks like an old list (it says '{book.sheet_by_name(s).cell_value(0, 3)}'), so it was skipped."))

    def add(sev, rw, apt_sys, owner, what, detail):
        issues.append((sev, rw["sheet"], rw["row"], str(rw["cells"][rw["col"]["apt"]].value).replace(".0", ""), apt_sys, owner, what, detail))

    # Monthly rate per flat type comes from the rate card; the sheet's most common charge per type should agree.
    std_month = dict(RATE_CARD)
    by_type = {}
    for rw in raw_rows:
        t = norm_type(rw["cells"][rw["col"]["type"]].value)
        mt = num(rw["cells"][rw["col"]["maint"]].value)
        if t and mt:
            by_type.setdefault(t, Counter())[mt] += 1
    for t, c in by_type.items():
        common = c.most_common(1)[0][0]
        if common != RATE_CARD[t] * 12:
            issues.append(("Check", "All", "", "", "", "", "Rate card", f"Most {t} flats are charged {common:,} for 2026, but the rate card says {RATE_CARD[t]:,} a month ({RATE_CARD[t] * 12:,} a year)."))

    seen = {}
    for rw in raw_rows:
        c, col = rw["cells"], rw["col"]
        g = lambda k: num(c[col[k]].value) if k in col else 0
        name, notes = clean_name(c[col["name"]].value)
        apt, prob = norm_apt(c[col["apt"]].value, rw["block"])
        if prob:
            add("Fix", rw, apt, name, "Apartment number", prob)
        if apt in seen:
            add("Fix", rw, apt, name, "Duplicate apartment", f"Rows {seen[apt]} and {rw['row']} both read as apartment {apt}. Check which is right.")
            apt = f"{apt}#{rw['row']}"
        seen[apt] = rw["row"]
        typ = norm_type(c[col["type"]].value)
        if not typ:
            add("Fix", rw, apt, name, "Flat type", f"Type '{c[col['type']].value}' isn't recognised")
            typ = "2-Bed"
        poss, tags, pprob = parse_possession(c[col["possession"]], book.datemode)
        notes += tags
        if pprob:
            add("Check", rw, apt, name, "Possession date", pprob + ". The new system bills on the possession day each month, so it needs this.")
        arrears, maint, disc, adj, rec, bal = g("arrears"), g("maint"), g("discount"), g("adjust"), g("received"), g("balance")
        if None in (arrears, maint, disc, adj, rec, bal):
            add("Fix", rw, apt, name, "Not a number", "One of the money columns isn't a number")
            arrears, maint, disc, adj, rec, bal = (x or 0 for x in (arrears, maint, disc, adj, rec, bal))
        calc = arrears + maint - disc - adj - rec
        if calc != bal:
            add("Fix", rw, apt, name, "Balance doesn't add up", f"Arrears {arrears:,} + 2026 charge {maint:,} - discount {disc:,} - adjustment {adj:,} - received {rec:,} = {calc:,}, but the sheet says {bal:,}.")
        if poss and poss > (as_of or "9999") :
            add("Check", rw, apt, name, "Possession date in the future", f"Possession {poss} is after the sheet date {as_of}.")
        if poss and poss >= "2026-01-01" and arrears > 0:
            add("Check", rw, apt, name, "Arrears before possession", f"Possession is {poss}, but there are {arrears:,} of arrears up to Dec 2025. Maybe a transfer date?")
        if arrears < 0:
            add("Info", rw, apt, name, "Credit brought forward", f"Arrears column is {arrears:,}: an advance from before 2026.")
        if bal < 0:
            add("Info", rw, apt, name, "Owner in credit", f"Balance is {bal:,}: the owner has paid {-bal:,} in advance.")

        sm = std_month.get(typ, 0)
        hold = False
        if maint == 0:
            rate, months, hold = sm, 0, True
            add("Check", rw, apt, name, "No 2026 charge", "Nothing charged for 2026. Kept off billing until someone confirms it should be billed.")
        elif sm and maint % sm == 0 and maint // sm <= 12:
            rate, months = sm, maint // sm
            if months < 12:
                # The sheet starts the charge the month after possession.
                expect = None
                if poss:
                    expect = 12 - int(poss[5:7]) if poss[:4] == "2026" else 12
                if expect is not None and expect != months:
                    add("Check", rw, apt, name, "Part-year charge", f"2026 charge covers {months} months at {sm:,}; from the possession date {poss} we'd expect {expect}.")
                elif expect is None:
                    add("Info", rw, apt, name, "Part-year charge", f"2026 charge covers {months} months at {sm:,}.")
        elif maint % 12 == 0:
            rate, months = maint // 12, 12
            add("Check", rw, apt, name, "Unusual rate", f"2026 charge {maint:,} is {rate:,} a month; the rate card says {sm:,} for a {typ}.")
        else:
            rate, months = sm, max(1, round(maint / sm)) if sm else 12
            add("Check", rw, apt, name, "Odd 2026 charge", f"2026 charge {maint:,} isn't a whole number of months at {sm:,}.")

        monthly_disc, waiver = 0, 0
        if disc:
            if disc < maint and months:
                monthly_disc = round(disc / months)
                if disc * 2 >= maint:
                    add("Check", rw, apt, name, "Large discount", f"Discount {disc:,} is {round(100 * disc / maint)}% of the 2026 charge. Confirm it is approved.")
            else:
                waiver = disc
                add("Check", rw, apt, name, "Waiver", f"Discount {disc:,} is more than the 2026 charge ({maint:,}), so it looks like a waiver of arrears. Confirm it is approved.")
        if adj:
            add("Info", rw, apt, name, "Adjustment", f"Adjustment of {adj:,} on the sheet.")

        future = 0 if hold else min(months, future_months)
        opening = bal - (rate - monthly_disc) * future
        owners.append({
            "apt": apt, "aptSheet": str(c[col["apt"]].value).replace(".0", ""), "block": rw["block"], "series": rw["series"],
            "type": typ, "name": name, "notes": notes, "possession": poss, "possessionRaw": str(c[col["possession"]].value),
            "rate": rate, "standardRate": rate == sm, "monthlyDiscount": monthly_disc, "hold": hold,
            "sheet": {"arrears2025": arrears, "charge2026": maint, "discount": disc, "adjustment": adj, "received2026": rec, "balance": bal,
                      "monthsCharged": months, "sheetName": rw["sheet"], "row": rw["row"]},
            "monthsLeftForNewSystem": future, "opening": opening,
        })

    for name, x in recon.items():
        if x.get("expected") and x["expected"][0] != len(owners):
            issues.append(("Check", name, x["expected"][1], "", "", "", "Apartment count", f"The sheet notes the list should be {x['expected'][0]}, but the two sheets have {len(owners)} apartment rows ({sum(1 for o in owners if o['sheet']['sheetName'] == 'A BLOCK')} on A BLOCK, {sum(1 for o in owners if o['sheet']['sheetName'] == 'AA BLOCK')} on AA BLOCK)."))
    # Totals row on each sheet vs the rows themselves.
    for name, x in recon.items():
        if not x["totals"]:
            continue
        rows = [o for o in owners if o["sheet"]["sheetName"] == name]
        for k, key in (("arrears", "arrears2025"), ("maint", "charge2026"), ("discount", "discount"), ("received", "received2026"), ("balance", "balance")):
            s = sum(o["sheet"][key] for o in rows)
            if x["totals"].get(k) is not None and s != x["totals"][k]:
                issues.append(("Fix", name, "", "", "", "", "Total row is off", f"{k}: rows add up to {s:,} but the TOTAL row says {x['totals'][k]:,}."))

    OUT.mkdir(exist_ok=True)
    blocks = sorted({o["block"] for o in owners}, key=lambda b: (len(b), b))
    meta = {"source": Path(a.xls).name, "asOf": as_of, "firstMonth": a.first_month, "goLive": f"{a.first_month}-01",
            "importedAt": dt.datetime.now().isoformat(timespec="seconds"), "blocks": blocks,
            "rates": [{"type": t, "monthly": m} for t, m in sorted(std_month.items(), key=lambda x: x[1])],
            "phones": 0}
    (OUT / "owners-real.json").write_text(json.dumps({"meta": meta, "owners": owners}, indent=1, ensure_ascii=False), encoding="utf-8")
    sev_rank = {"Fix": 0, "Check": 1, "Info": 2}
    issues.sort(key=lambda i: (sev_rank[i[0]], str(i[1]), i[2] if isinstance(i[2], int) else 0))
    with open(OUT / "cleanup-report.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Severity", "Sheet", "Excel row", "Apartment (sheet)", "Apartment (new system)", "Owner", "Issue", "Details"])
        w.writerows(issues)
        w.writerow([])
        w.writerow(["Fix", "All", "", "", "", "", "No WhatsApp numbers", "The sheet has no phone numbers. The new system needs each owner's WhatsApp number (the QuickBooks customer contact list)."])

    # Summary: counts and totals only.
    tot = lambda k: sum(o["sheet"][k] for o in owners)
    billed = [o for o in owners if not o["hold"]]
    new_bills = sum((o["rate"] - o["monthlyDiscount"]) * o["monthsLeftForNewSystem"] for o in owners)
    print(f"Sheet date {as_of}. Imported {len(owners)} apartments in blocks {', '.join(blocks)} (the sheet says the list should be 207).")
    print("Rate card used: " + ", ".join(f"{t} {m:,}" for t, m in sorted(std_month.items(), key=lambda x: x[1])))
    print(f"Arrears to Dec 2025 {tot('arrears2025'):,} | 2026 charges {tot('charge2026'):,} | discounts {tot('discount'):,} | received in 2026 {tot('received2026'):,} | balance {tot('balance'):,}")
    print(f"Opening balances for the new system (to {dt.date(y0, m0, 1) - dt.timedelta(days=1):%b %Y}) {sum(o['opening'] for o in owners):,} + {a.first_month[:4]} bills it will send {new_bills:,} = {sum(o['opening'] for o in owners) + new_bills:,}")
    print(f"Owing {sum(1 for o in owners if o['opening'] > 0)} | paid up {sum(1 for o in owners if o['opening'] == 0)} | in credit {sum(1 for o in owners if o['opening'] < 0)} | not billed until confirmed {len(owners) - len(billed)}")
    print(f"No possession date {sum(1 for o in owners if not o['possession'])} | non-standard rate {sum(1 for o in owners if not o['standardRate'] and not o['hold'])} | WhatsApp numbers 0")
    print("Report: " + ", ".join(f"{k} {v}" for k, v in Counter(i[0] for i in issues).items()) + " (+1 Fix for missing numbers)")
    print("Issues by kind: " + "; ".join(f"{k} {v}" for k, v in Counter(i[6] for i in issues).most_common()))


if __name__ == "__main__":
    main()
