# Bag Tracker

Made by Finlay Russell — <finlay3110@gmail.com>

> **Provided as is, with no warranty.** This tool formats what you type; it does
> not check it. You are responsible for verifying the contents of every bag.

A browser-based tool for ambulance and event-medical companies to produce the
paperwork for an equipment / consumables bag (bandages, airways, dressings…) as
one A4 PDF:

1. **Bag labels** — four cut-out labels for the outside of the bag: bag number,
   company, seal number and an "if found" notice.
2. **Kit list** — each module or pouch in the bag, what should be inside it and
   the minimum quantity of each, with a packed-by / checked-by block.
3. **Kit checklist** — the same list with columns to write the count found, tick
   it off and note anything replaced, plus seal numbers and a signature block.
4. **Sign in / sign out log** — a landscape sheet recording who took the bag out,
   when, where to, and when it came back, with seal numbers both ways.

Pick which sheets to print, and how many checklist copies, on the Generate tab.
Enter several bag numbers separated by commas to get a full set for each
identical bag in one PDF. Every page carries the kit list version and the date the
layout last changed, so an out-of-date printout is easy to spot.

Everything runs locally in the browser — no server, no upload. The PDF is built
with [jsPDF](https://github.com/parallax/jsPDF), bundled in the site's `../vendor/`, so it
works offline. Based on the
[ambulance medication tracker](https://github.com/finlay3110/ambulance-medication-tracker).

## Using it

Open `index.html` in a browser.

1. **Setup** — company details (and logo), then the bag's name, number, where it
   is kept, seal number and who packed it.
2. **Pouches** — add each module or pouch, then add its items with a minimum
   quantity. Tick "Sealed with a tag" on a pouch that is tagged shut and enter
   its seal number (or leave it blank to write by hand). Items and pouches can be
   renamed, reordered and removed in place.
3. **Generate** — choose the sheets, then download or preview the PDF, and export the bag to `.json` so it
   can be loaded again (or used as the starting point for another bag).

The bag is also kept in this browser's storage, but that can be cleared — export
it to keep it.

## Checking a bag on a phone, with QR stickers

**Download QR stickers** on the Generate tab prints six stickers per bag number.
Beside each code are boxes to write the date printed and who printed it. Tick
**Large stickers** for four per page with a bigger code that is easier to scan.
Scanning one with a phone camera opens this tool with that bag's pouches and
kit list loaded, on the **Check bag** tab (or carries on with today's check on
that phone). The bag travels in the link after the `#`, so nothing is uploaded.
Make new stickers after changing the pouches.

On **Check bag**, type the number found for each item, or tap the tick when all
are there; anything under its minimum shows as short. Sealed pouches record the
seal found, intact or broken, and any new seal. Add notes, then everyone who
checked the bag adds their name and clinical grade and signs on screen; the time
each signs is recorded. **+ Add person** adds a crewmate, so both of a crew can
sign the check at the start of a shift. **Download check (PDF)** gives the kit
checklist filled in with the counts, OK or SHORT, seals, notes and a Checked by
table with each person's signature. On a phone, **Share check** sends the PDF
straight to WhatsApp, email or another app. **New check** clears the counts and keeps the bag.

## User guide

[Bag-Tracker-User-Guide.pdf](Bag-Tracker-User-Guide.pdf) walks through every tab and sheet,
with screenshots. It is built from `docs/user-guide.html` and screenshots of the
live app, so rebuild it after changing the app:

```
npm run guide
```

This needs Playwright, and python3 with `pypdfium2` for the sample PDF pages.

## Tests

```
npm install
npm test
```

## Licence

MIT — see [LICENSE](LICENSE). jsPDF is bundled under its own MIT licence
(`../vendor/jspdf-LICENSE.txt`).
