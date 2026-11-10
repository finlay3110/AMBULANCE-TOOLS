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
  - the kit bag and drug bag assigned to it;
  - its people: name, clinical grade, radio, and a **Manager** tick.

## The PDF

A landscape A4 deployment log. The top shows the company (with CQC number and
logo), date, event, venue, who made the deployment, the number of units and
staff, and the contact number. Then each unit has a dark bar with its
callsign, vehicle, location and bags, and one row per person with boxes for
the time they **signed in**, **started a break** and were **stood down**, and
a **signature**. Long deployments run over several pages, with the column
headings repeated.

Anything left blank (a name, a registration, a location, a bag) prints as
space to fill in by hand.

## Plans for venues

**Save as plan** saves the units, callsigns, locations, ambulance ticks and
each post's grade and manager tick, and leaves the names, radios, bags,
vehicle registrations, date and "made by" blank. Next time, **Open plan or
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
