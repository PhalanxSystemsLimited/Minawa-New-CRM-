# Minawa CRM design spec (locked)

Taken from the live render of `demo/minawa-maintenance-demo.html`, using the computed styles of the final theme ("Minawa Group website style").
The production CRM must look identical to it. `design/minawa-theme.css` is the demo's stylesheet, copied verbatim, and is imported as-is as the app's global CSS.

## Rules
1. Never restyle. Import `minawa-theme.css` unchanged. React components output the **same HTML structure and class names** as the demo (`.side`, `.side-i`, `.top`, `.card`, `.btn`, `.btn.primary`, `.pill`, `.ptabs`, `.hero`, etc.).
2. New screens are built only from existing classes. Any new rule goes in a separate `minawa-additions.css` and uses only the tokens below.
3. No Tailwind or shadcn styling, so their defaults (rounded corners, shadows, spacing) can't drift from the design.
4. Corners are square everywhere. Only avatars, dots and switches are round.

## Colours (final values)
| Token | Hex | Use |
|---|---|---|
| `--ink` | #161B1F | Sidebar, hero panel, headings, primary text |
| `--ink-2` | #3A4248 | Secondary ink, info text |
| `--brick` / `--accent` | #9C4A24 | Primary buttons, active nav, eyebrows, links |
| `--brick-dark` | #6E3317 | Hover on brick |
| `--brick-light` | #E3A782 | Brick text on ink (hero highlights) |
| `--stone` / `--bg` | #F3F0EA | Page background |
| `--sand` | #E4DED4 | Neutral chips |
| `--surface` | #FFFFFF | Cards |
| `--line` / `--line-strong` | #D9D3C9 / #C3BBAE | 1px card borders, table rules / input borders |
| `--muted` | #565B5F | Secondary text |
| Body text | #3A4045 | Default paragraph colour |
| `--good` / soft | #2F6B3F / #E2EDE4 | Paid, Safepay received |
| `--warn` / soft | #8A5A0B / #F6EBD5 | Overdue |
| `--bad` / soft | #B3261E / #FBE4E1 | Flagged, Fee + notice |
| `--accent-soft` | #F4E7DE | Receipt numbers, "Owes" box |
| WhatsApp | head #008069, bg #ebe4da, out #d8fbd1 | WhatsApp phone preview |

## Typography
- **Inter** (400–800) for UI text. **Space Grotesk** (500–700) for headings and figures.
- Body: Inter 14px / 1.55, colour #3A4045.
- Page eyebrow (`MAINTENANCE · MURREE`): Space Grotesk 12.5px, weight 600, letter-spacing .16em, uppercase, brick.
- Page / project title: Space Grotesk 32px (clamp 24–32), weight 700, letter-spacing −.02em, line-height 1.15, ink.
- Profile title (`Apartment A-101`): Space Grotesk 28px, weight 700.
- Card title (`h3`): Space Grotesk 16–17px, weight 700.
- Hero numbers: Space Grotesk 700, letter-spacing −.02em.
- Sidebar brand: Space Grotesk 15px, weight 800. Subtitle: Inter 11.5px at 50% stone.
- Sidebar section label: Space Grotesk 10.5px, weight 700, letter-spacing .16em, uppercase, 42% stone.
- Sidebar item: Inter 14px, weight 500, padding 10px 12px, 75% stone. Active: brick background, white, weight 600.
- Tabs (`.ptabs`): Inter 13.5px, weight 600, padding 10px 14px. Active: ink with a 3px brick underline.
- Buttons: Inter 13px, weight 600, letter-spacing .2px, padding 7px 14px, 1px border. Primary is brick on white text.
- Table header: Inter 10.5px, weight 700, letter-spacing .12em, uppercase, muted, padding 9px 10px. Cell: Inter 13px, padding 10px.
- Status pill: Inter 12px, weight 600, padding 3px 10px, soft background with a dot.

## Layout
- 252px ink sidebar, a sticky stone top bar (search, Quick actions, bell, user chip), then content.
- Cards: white, 1px `--line` border, 20px padding, no shadow.
- Hero panel: solid ink, a chip row, a big headline with a brick-light highlight, and a stat row with thin dividers.

## Screens in the demo (keep them, then extend)
Dashboard · Project ▸ Overview / Apartments / Payments / To do / Settings · Apartment profile (Bills, Payments, History, Notes & messages) · Bill / receipt document · WhatsApp preview · Quick actions · Demo bar (dev only, removed in production).
