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
  **started a break** and were **stood down**, and a **signature**.

A unit that runs onto a new page repeats its band, marked **CONTINUED**, with
its column headings.

Anything left blank (the date, a name, a registration, a location, a bag
number) prints as an empty box, big enough to fill in with a pen on the day. A
unit with its bag ticks off has no bag boxes at all.

## Plans for venues

**Save as plan** saves the units, callsigns, locations, ambulance ticks, bag
ticks, and each post's grade and manager tick, and leaves the names, radios,
bag numbers, vehicle registrations, date and "made by" blank. Next time, **Open plan or
deployment** on the first tab starts from that plan: fill the names in on
screen, or print it and fill them in by hand.

**Save deployment** saves everything, names included.

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
