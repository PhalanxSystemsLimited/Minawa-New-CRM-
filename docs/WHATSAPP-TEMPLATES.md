# WhatsApp templates

Create these in WhatsApp Manager › Message templates, or submit them from the CRM (Settings › Message templates › Submit to Meta).

- **Category:** Utility.
- **Language:** English (`en`).
- **Variable type:** Name (named parameters).
- **Name:** the template's name in Meta must match the name in the CRM (the small box next to Save).

Rules Meta enforces:
- No variable at the very start or end of the text.
- No line breaks inside a variable's value. The CRM takes care of this.
- Every variable needs a sample value when you create the template.

The **Pay Now** button is a URL button: `https://YOUR-CRM/pay/{{1}}`, with the sample value `PL-4801`.

## Bill: `minawa_bill`

- **Header:** Document (the bill PDF)
- **Button:** URL, "Pay Now", `https://YOUR-CRM/pay/{{1}}`
- **Samples:** `name` = Hamza · `month` = November 2026 · `apt` = A-101 · `amount` = Rs 5,000 · `breakdown` = Oct 2026 Rs 5,000 + Nov 2026 Rs 5,000 · `dues` = Rs 10,000 · `fee` = Rs 1,000 · `total` = Rs 11,000 · `due` = 19 Nov 2026

```
Hi {{name}}, your maintenance bill for {{month}} (Apt {{apt}}) is {{amount}}.

Your dues: {{breakdown}}
Dues: {{dues}}
Fine: {{fee}}
Total payable: {{total}}, due by {{due}}

Your statement is attached. Tap Pay Now to pay by debit or credit card.
```

## Disconnection notice: `minawa_final_notice`

- **Header:** Document (the bill PDF)
- **Button:** URL, "Pay Now", `https://YOUR-CRM/pay/{{1}}`
- **Samples:** `name` = Hamza · `apt` = A-101 · `breakdown` = Oct 2026 Rs 5,000 + Nov 2026 Rs 5,000 · `dues` = Rs 10,000 · `fee` = Rs 1,000 · `total` = Rs 11,000 · `final` = 3 Dec 2026

```
Dear {{name}}, final notice for Apt {{apt}}.

Your dues: {{breakdown}}
Dues: {{dues}}
Fine: {{fee}}
Total overdue: {{total}}

Please pay by {{final}}, or your utilities will be disconnected.
```

## Reminder before the due date: `minawa_reminder`

- **Header:** Document (statement PDF)
- **Button:** URL, "Pay Now", `https://YOUR-CRM/pay/{{1}}`
- **Samples:** `name` = Hamza · `apt` = A-101 · `due` = 19 Nov 2026 · `breakdown` = Oct 2026 Rs 5,000 + Nov 2026 Rs 5,000 · `total` = Rs 11,000

```
Hi {{name}}, a reminder from Minawa Group: your maintenance for Apt {{apt}} is due on {{due}}.

Your dues: {{breakdown}}
Total to pay: {{total}}

Tap Pay Now to pay by debit or credit card. Please ignore this if you have already paid.
```

## Payment link: `minawa_payment_link`

- **Header:** Document (statement PDF)
- **Button:** URL, "Pay Now", `https://YOUR-CRM/pay/{{1}}`
- **Samples:** `name` = Hamza · `apt` = A-101 · `breakdown` = Oct 2026 Rs 5,000 + Nov 2026 Rs 5,000 · `dues` = Rs 10,000 · `fee` = Rs 1,000 · `total` = Rs 11,000

```
Hi {{name}}, this is Minawa Group with your payment link for Apt {{apt}}.

Your dues: {{breakdown}}
Dues: {{dues}}
Fine: {{fee}}
Total to pay: {{total}}

Tap Pay Now to pay by debit or credit card. The link is for this exact amount.
```

## Receipt: `minawa_receipt`

- **Header:** Document (receipt PDF)
- **Button:** none
- **Samples:** `paid` = Rs 5,000 · `apt` = A-101 · `date` = 4 Nov 2026 · `balance` = Rs 0

```
Payment received: {{paid}} for Apt {{apt}} on {{date}}. Remaining balance: {{balance}}. Thank you. Your receipt is attached.
```

## Bill paid from credit: `minawa_bill_credit`

- **Header:** Document (the bill PDF)
- **Button:** none
- **Samples:** `name` = Hamza · `month` = November 2026 · `amount` = Rs 5,000 · `apt` = A-101 · `credit` = Rs 2,500

```
Hi {{name}}, your {{month}} maintenance of {{amount}} for Apt {{apt}} was paid from your advance credit. Credit left: {{credit}}. Thank you.
```

## Maintenance notice: `minawa_maintenance_notice`

- **Header:** None
- **Button:** none
- **Samples:** `project` = Country Club Apartments · `title` = Water supply interruption · `text` = Water supply to Block C will be off on 13 Nov, 10 am to 4 pm for tank cleaning.

```
Maintenance notice from Minawa Group, {{project}}:

{{title}}
{{text}}

For help, reply to this message.
```

## Announcement: `minawa_announcement`

- **Header:** None
- **Button:** none
- **Samples:** `text` = Water supply to Block C will be off on 13 Nov, 10 am to 4 pm for tank cleaning.

```
Dear resident, a message from Minawa Group:

{{text}}

Thank you,
Minawa Group
```

## Owners' replies

When an owner replies:
- A picture or PDF from an owner who owes money goes to **To do › Check these bank transfers**.
- Text replies are saved as notes on the apartment.

A reply opens WhatsApp's 24-hour window, so the "Can't find it" answer can be sent as free text.
