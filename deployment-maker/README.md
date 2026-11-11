# Deployment Maker

Plan who is deployed where at an event, and print a deployment log to sign
people in and out on the day.

## What it records

- **Event:** event name, venue, date, and who made the deployment.
- **Company:** taken from your saved [Company Profile](../company-profile/README.md)
  automatically, or from an imported company file.
- **Units**, each with:
  - a callsign;
  - **Ambulance**: tick it and it asks for the vehicle registration;
  - **Roaming**, or the location it is assigned to;
  - **Kit bag** and **Drug bag** ticks (both on for a new unit; untick them for
    a unit with none, such as event control), each with its number, or leave the
    number blank to write in on the day;
  - its people: name, clinical grade, radio, and a **Manager** tick.
- **Copy** on a unit makes the next callsign (Alpha 1 to Alpha 2) with the same
  set-up and nobody on it yet.
- Bag numbers set up in the Bag Tracker and Drug Bag Tracker on the same device
  are suggested as you type a unit's bag numbers.

## On the day

The **On the day** tab lists everyone with their status (not signed in, on
duty, on break, stood down) and a running count. Tap **Sign in**, **Start
break**, **End break** or **Stand down** to record the time now; type over a
time to change it, or clear it to undo. A post with no name can be named as the
person arrives. The times print on the deployment log; signatures are still
done on paper. **Clear all times** starts the day again.

## The PDF

A landscape A4 deployment log. The top shows the company (with CQC number and
logo), date, event, venue, who made the deployment, the number of units and
staff, and the contact number.

Each unit is its own block, with space between blocks:

- a dark band with its callsign, tagged **AMBULANCE** or **ROAMING**;
- a light strip with its location, vehicle registration, kit bag and drug bag,
  always in the same places and lined up with the columns below;
- one row per person: name (with a green **MANAGER** badge where it applies),
  clinical grade and radio, then boxes for the time they **signed in**,
  **started** and **ended a break** and were **stood down**, and a
  **signature** (times recorded on the day are filled in).

A unit that runs onto a new page repeats its band, marked **CONTINUED**, with
its column headings.

Anything left blank (the date, a name, a registration, a location, a bag
number) prints as an empty box, big enough to fill in with a pen on the day. A
unit with its bag ticks off has no bag boxes at all.

Ticked by default, a **radio list** page follows the log for event control:
every person with their unit, location, grade and radio.

## Plans for venues

**Save as plan** keeps a plan on this device, listed on the Event tab to open or
delete; **Download plan** saves the same thing as a file to share. A plan keeps the units, callsigns, locations, ambulance ticks, bag
ticks, and each post's grade and manager tick, and leaves the names, radios,
bag numbers, vehicle registrations, times, date and "made by" blank. Opening it
starts from that plan: fill the names in on
screen, or print it and fill them in by hand.

**Save deployment** saves everything, names included.

## User guide

[Deployment-Maker-User-Guide.pdf](Deployment-Maker-User-Guide.pdf), linked from
the page footer. Rebuild it from the current app with
`node docs/build-guide.js` (needs Playwright, and python3 with pypdfium2).

## Files

| File | What it is |
|------|------------|
| `index.html` | The page |
| `app.js` | Form state, storage, plans, save and open |
| `pdf.js` | Builds the deployment log PDF |
| `styles.css` | Additions to the Bag Tracker's styles |
| `test/smoke.js` | Browser test: `node test/smoke.js` |

It uses the Bag Tracker's stylesheet and its bundled copy of
[jsPDF](https://github.com/parallax/jsPDF), and the site's shared `theme.js`.
Everything stays in the browser on this device; nothing is uploaded.
