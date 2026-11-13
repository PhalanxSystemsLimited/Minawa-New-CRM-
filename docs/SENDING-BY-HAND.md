# Sending WhatsApp messages by hand

Nothing goes out by itself. Bills, fines and balances still update automatically, on the same schedule. Every WhatsApp message is sent by staff from **Send on WhatsApp**, a tab in each project.

## How it works

1. **What to send.** Pick one of these:
   - **Ready to send**: bills, reminders, final notices, receipts and maintenance notices the CRM has prepared and nobody has sent yet;
   - **Payment link**;
   - **Bill**;
   - **Reminder**;
   - **Final notice**;
   - **Receipt**;
   - **Own message**: write it yourself. `{{name}}`, `{{apt}}`, `{{total}}`, `{{due}}` and `{{project}}` fill in for each owner, and you can add a Pay Now link.
2. **Who gets it.** Pick everyone, everyone who owes, everyone overdue, one block, or tick owners one by one (search by apartment, name or number).
   - Owners with no working number, and on-hold flats for money messages, are left out and listed separately.
3. **Send.** The CRM writes each message with today's figures. Each Pay Now link is for exactly what that owner owes right now. Then, for each owner:
   - **Open chat in WhatsApp** opens their chat in WhatsApp Web, with the message typed in. You can edit the text in the CRM first.
   - Press Send in WhatsApp.
   - Come back to the CRM. It asks **Did you send the message?** (on whatever CRM page you return to):
     - **Yes, sent** records the message as sent on the owner's history. Staff activity gets "*name* sent the Bill on WhatsApp to Apt A-101 · owner (number); balance Rs …", and the next owner comes up.
     - **No, not sent** records in staff activity that the chat was opened but the message wasn't sent. You stay on that owner to try again or skip.
     - **Not yet, ask me later** asks again the next time you come back.
   - **Mark as sent** is there in case the question doesn't appear (for example if the browser blocked the new tab).
   - The admin sees all of this under Staff activity (filter: Bills, notices and messages), with a link to each apartment.
   - **Skip** moves on and leaves the message unsent.
   - **Don't send this** removes a prepared message from Ready to send.
   - The PDF (bill, receipt or statement) can be downloaded and attached by hand if wanted.

## Other ways to start

- An owner's page → **Send payment link** → **Open in WhatsApp** starts with just that owner.
- **Notices** prepares the notice for the chosen owners, then goes straight to sending it.

## What happens on its own

- **Paid before it was sent.** A bill or reminder still waiting is dropped once the owner has paid.
- **Newer replaces older.** Sending a newer message to an owner replaces the older ones still waiting.

## Settings

The switch is in Settings → Billing schedule → *Send WhatsApp messages automatically*:

- **Off** (now): sending by hand, as described above.
- **On**: the WhatsApp Business API sends everything. Turn it on only once the company number and Meta keys are set up.

## Testing

While `WHATSAPP_TEST_NUMBER` is set in `.env.local`, every chat opens with that number instead of the owner's, and the history marks it "Test only". Remove it to message owners.

## Pay Now links

Pay Now links use `APP_URL`. Owners can only open them once the CRM is online with its public address.
