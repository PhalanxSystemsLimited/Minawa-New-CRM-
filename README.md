# Minawa New CRM

Minawa Group ERP, Phase 1: maintenance dues. Built by Phalanx Systems.

- **Billing:** every flat is billed **on the 25th at 11:00 AM for that month** (after use: the 25 Nov bill is for November). That bill is the 1st reminder, and it's due 15 days later, on the 10th of the next month. The 2nd and 3rd reminders go out on the 3rd and 7th while it's unpaid.
  - **After the due date:** the day after, the **fine** is added. It's a % set by the accountant. Owners get a final notice with their updated dues, and flats still unpaid 15 days later are flagged for disconnection.
  - **Plans:** each owner is on a **monthly**, **quarterly** (billed 25 Dec, Mar, Jun and Sep for the next quarter) or **annual** (billed 25 Dec for the next year) plan.
  - **Possession:** billing starts on the possession date. The first month is charged from that day, on the first bill after possession.
- **Accountant's desk:**
  - **Utility bills** (electricity for Country Club and Oakwood): enter each flat's amount for the month, or import a CSV. It goes on that month's bill.
  - **Notices:** water or electricity outages, lift work and more, written from presets or from scratch, and sent on WhatsApp to all owners, a block, or chosen flats.
  - **New possession:** record a flat handed over to its first owner.
  - **Fine %:** change it, apply it to late owners, and send them their updated dues.
- **WhatsApp, sent by hand:** bills, reminders, notices, payment links and receipts wait in **Send on WhatsApp**. Staff open each owner's chat (WhatsApp Web or the app) with the message and its **Pay Now** link typed in, send it, and confirm it was sent. There is no automatic sending.
- **Safepay:** each message has a payment link for the exact amount. A payment is recorded only after Safepay's API confirms it.
- **Web CRM:** looks exactly like the demo (`minawa-crm-main/demo`), with sign-in, roles, billing settings, a message log, import and project setup added.

**Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres, Auth, pg_cron), WhatsApp sent by hand (WhatsApp Web), Safepay, hosted on Vercel.

---

## 1. Try it on your computer (no accounts needed)

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local      # local mode: leave the Supabase and Safepay values empty
npm run dev
```

1. Open http://localhost:3000.
2. Sign in as **admin@minawa.local** or **accountant@minawa.local**. The password is **minawa**.

With no Supabase keys, the CRM keeps its data in `data/local-db.json`. That file starts with sample data: three projects, as of 11 Nov 2026, because `.env.example` sets `APP_TODAY=2026-11-11`. To reset the sample, run `npm run seed`.

Without Safepay keys, **Pay Now** opens a test checkout.

## 2. Design: exactly the demo's

- `styles/minawa-theme.css` is the demo's stylesheet, copied without changes. Do not edit it.
- New screens use only its classes. Anything new goes in `styles/minawa-additions.css`, using the same colours and fonts.
- The pages produce the same HTML structure and class names as the demo's render functions.
- The colours, fonts and sizes are listed in `design/DESIGN-SPEC.md`.

## 3. Go live

### Supabase
1. Create a project, in the **Mumbai (ap-south-1)** region for Pakistan.
2. In SQL Editor, run `supabase/migrations/0001_schema.sql`.
3. In Authentication › Users, add the first admin (email and password). Then add their staff row in SQL Editor:
   ```sql
   insert into staff (id, email, name, role) select id, email, 'Your name', 'admin' from auth.users where email = 'you@minawagroup.pk';
   ```
   Everyone after that is added from the CRM: **Staff & connections › Add someone**.
4. Copy the Project URL, the anon key and the service role key into the environment (step 5).

### WhatsApp
Messages are sent by hand from each project's **Send on WhatsApp** page: it opens each owner's chat with the message typed in, and asks "Did you send the message?" on coming back. Keep `WHATSAPP_TEST_NUMBER` set while testing (every chat opens with that number); remove it to go live.

### Safepay
1. Get the merchant account approved. Safepay asks for business registration, the NTN, directors' CNICs, the business address and the receiving bank account.
2. In Developers › API keys, copy the secret key into `SAFEPAY_SECRET_KEY`.
3. In Developers › Endpoints, add `https://YOUR-CRM/api/safepay/webhook` and copy its shared secret into `SAFEPAY_WEBHOOK_SECRET`.
4. Test with `SAFEPAY_ENV=sandbox`. When you're ready for real payments, switch to `SAFEPAY_ENV=production` with the live keys.

### Vercel
1. Import this folder as a project (from a GitHub repo, or with `npx vercel`).
2. Set every value from `.env.example`. In production, leave `APP_TODAY` empty and set `ALLOW_SIMULATED_PAYMENTS=false`.
3. Point the domain at it (for example crm.minawagroup.pk) and set `APP_URL` to that address.

### The schedule
1. Edit `supabase/migrations/0002_schedule.sql`: put in your CRM address and `CRON_SECRET`.
2. Run it in the Supabase SQL Editor.

It calls `/api/cron/daily` every day at 11:00 PKT, and `/api/cron/dispatch` every 10 minutes. Dispatch retries unsent messages and catches any Safepay payment whose webhook was missed.

### Rate cards
`supabase/migrations/0003_rate_cards.sql` loads the 2026 rate cards and billing settings from Minawa's sheets:

| Project | Monthly rates |
|---|---|
| Country Club | 1-Bed Rs 6,000 · 2-Bed Rs 8,000 · 3-Bed Rs 9,000 · 3-Bed (D/L) Rs 10,000 |
| Oakwood | 1-Bed Rs 5,000 · 2-Bed Rs 6,000 · Cottage Rs 8,000 |
| Royal Enclave | Apartment Rs 12,000 |

Run it after `0001_schema.sql`.

### Import the owners
1. In the CRM, open the project and choose **Set up this project** (or **Apartments › Import or add owners**).
2. Pick a CSV saved from Excel. `public/owners-template.csv` shows the columns.
3. For the accountant's yearly `.xls` sheet, first run `python scripts/import_maintenance_xls.py` from `minawa-crm-main`, then pick the JSON it makes.
4. Enter the rate card and the **first month the system bills**, and import.

   The accountants' sheets charge the whole of 2026 up front, so the simplest start is **January 2027**: each flat's opening balance is then exactly the sheet's Balance column, and the first bill (for January) goes out on 25 December 2026.

   The importer reads the sheets' own column names: Apt No / Apt #, Apt Type, Client Name, Date of Possession, Arrears, the year's Maintenance, Electricity, Adjustment Cost, Discount, Received and Balance. It also understands:
   - Oakwood floors, such as `1 (LGF)`, which becomes `A-1 (LGF)` in Block A;
   - transfers marked `(Tfr)`;
   - flats whose yearly charge isn't 12 × the rate card: they keep their own monthly rate (for example Royal Enclave 16-11, Rs 180,000 a year = Rs 15,000 a month).

Keep `WHATSAPP_TEST_NUMBER` set while you check everything: every message goes to that number instead of the owners. Remove it to go live.

## 4. How it is built

| Path | What it is |
| --- | --- |
| `lib/engine.ts` | The billing rules, ported line for line from the demo: bills, reminders, late fee, notices, flags, promises, payment allocation, targets |
| `lib/store/` | Supabase store (production) and local file store. Both load one project, let the engine change it, and save only what changed, inside a lock |
| `lib/dispatch.ts` | After each change: makes the Safepay links new messages need, and tidies the Send on WhatsApp list |
| `lib/manual-send.ts`, `lib/actions-send.ts` | Sending by hand: the messages' text, opening each chat, and recording what was sent |
| `lib/safepay.ts` | Safepay API client |
| `lib/pdf.tsx`, `lib/docdata.ts` | Bills, receipts, statements and clearance certificates, on screen and as PDF |
| `lib/actions.ts`, `lib/import-action.ts` | Everything staff can do (server actions, with role checks) |
| `app/(crm)/…` | The screens |
| `app/pay/[linkId]` | Where the Pay Now button goes: it redirects to Safepay for the exact amount |
| `app/api/…` | Cron jobs, webhooks, CSV export, PDFs |
| `supabase/migrations/` | The database schema, row-level security and the schedule |

**Roles.**
- **Admins** (the CEO and directors) can change everything, approve or reject accountants' changes, do transfers, and manage staff.
- **Accountants** can record payments, enter utility bills, send notices, record new possessions and send payment links. Their changes to what owners are charged (discounts, generator charges, billing plan, monthly fees, adjustments, the fine, the billing schedule) and mass announcements wait for an admin's approval, with a reason.

**Safety.** A payment is only recorded after Safepay's API confirms it, never from the webhook body or a redirect. Every write runs inside one database lock. Safepay's webhook is checked with its HMAC-SHA512 signature.
