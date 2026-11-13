# Testing WhatsApp and payments on your own number (local, no Meta or Safepay account)

For testing only. The bridge logs into **your own WhatsApp** by QR code (like WhatsApp Web) and the CRM sends to it exactly as it will send to Meta's official WhatsApp Cloud API later.

- **Every message goes to one test number only**: `WHATSAPP_TEST_NUMBER` in `.env.local` (your own test number), or your own "Message yourself" chat if that's empty. Each message is headed "🧪 Minawa CRM test · would go to +92…" (the owner it was meant for). No owner is ever messaged.
- The CRM runs on **sample data** (`data/local-db.json`), not the live Supabase database, so test payments never change real balances.
- **Pay Now** opens the CRM's test checkout. Paying there confirms the payment and sends the "Payment received" WhatsApp with the receipt PDF, exactly like a real Safepay payment.
- WhatsApp Web automation isn't an official WhatsApp product. Keep it to light testing like this, on your own chat.

## Steps (Windows, in the "Minawa New CRM" folder)

1. Once, install the new parts:

   ```
   npm install
   ```

2. Window 1, the bridge:

   ```
   npm run wa:bridge
   ```

   A QR code appears. On your phone: **WhatsApp › Settings › Linked devices › Link a device**, then scan it. Wait for "✔ Connected as +92…".

   The login is saved in `.wa-bridge/`, so you scan only once. To unlink, remove "Minawa CRM (local test)" from Linked devices on your phone.

3. Window 2, the CRM in test mode (stop the normal `npm run dev` first):

   ```
   npm run dev:test
   ```

4. Open http://localhost:3000 and sign in as **admin@minawa.local** or **accountant@minawa.local**, password **minawa**.

## What to try

| In the CRM | What arrives on your WhatsApp |
|---|---|
| Country Club › Apartments › an apartment that owes money › **Send on WhatsApp** (or the green WhatsApp icon) › **Send now** | The payment message with **Pay Now** |
| **Pay Now** (on this PC, or on your phone on the same Wi-Fi) › pay on the test checkout | "Payment received" with the **receipt PDF**; if anything is still owed, a new Pay Now link |
| Country Club › **Notices** › e.g. Water outage › send to one or two flats | The maintenance notice (one message per flat) |
| Bill day: start with `npm run dev:test -- 2026-11-25`, then Settings › **Run today's billing now** (as admin) | The 25th's bills with the **PDF attached**. It also sends every reminder between 11 and 25 Nov, so expect a few dozen messages in your own chat |

Every message also shows in the CRM under **WhatsApp messages**. Staff & connections shows "Minawa Group (local test bridge)" as the WhatsApp connection.

## Going live later

1. Stop the bridge, and run `npm run dev` (or the deployed site) instead of `dev:test`.
2. In `.env.local`, set the real `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_BUSINESS_ACCOUNT_ID` from Meta, and the Safepay keys.
3. Keep `WHATSAPP_TEST_NUMBER` set to your number until you've checked the real templates.

## Testing with the live data (Supabase)

`npm run dev:live` instead of `npm run dev:test` runs the CRM on your **real Supabase data** (Oakwood, Royal Enclave, Country Club), sending WhatsApp through the same bridge. Because this is the real database, it has safety rails:

- **Test number required.** Every message goes to `WHATSAPP_TEST_NUMBER` only; the CRM won't start in this mode without it. In the CRM these messages are tagged **Test only**, so no owner's history suggests they received it.
- **No test payments.** Pay Now shows the payment page, but there's no pretend checkout, so nothing fake ever enters the real books. Test the payment and receipt flow in `npm run dev:test` (sample data), or with Safepay's sandbox later.
- **Real date only.** No pretend dates, so nothing is billed early. The first real bills go out on 25 Dec.
- **Brake.** The bridge sends at most 20 messages per 10 minutes; more fail visibly. Send notices and links to one or two flats, never "all owners".

What's useful to try on live data: a **payment link** to a flat (real dues, real breakdown, the PDF statement), and a **notice** to one or two flats. Your Supabase login (minawamaintenancepak@gmail.com, or the accountant) is used, not admin@minawa.local.

Note: the messages and activity entries you create here stay in the live database (tagged Test only).
