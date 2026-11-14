# Event CAD

A computer-aided dispatch log for event medical control, run on one laptop in the
browser. Nothing is uploaded: everything is kept in this browser's storage, and
exported to a file when you want to keep it or move it.

## Tabs

- **Setup:** the company (from your Company Profile), the event (name, venue, start
  and end, event lead, control contact, crowd size), the staffing (units with their
  callsign, type, registration for ambulances, staff and grades, and the standby
  point each starts at), the locations (standby points, points of interest and the
  treatment centre) and the hospitals. Units can be loaded from Deployment Maker:
  the deployment open there, a saved plan, or a Deployment Maker file. Alert times
  and an optional what3words key are set here too. **Export setup** and **Import
  setup** save and reuse it as a `.json` file. **Paper fallback pack** prints a unit
  status sheet with your callsigns, a call list, a blank call sheet and METHANE form,
  and your locations, hospitals and the MPDS protocols, in case the laptop fails.
- **CAD:** the clock, the controller on duty, the unit status board, the open and
  closed calls with a search, alerts, and the call sheet.
  - A call records when it came in, how (radio, phone, walk-up, steward/security)
    and who reported it; where (point of interest, description, what3words and
    site map grid reference); the MPDS protocol (1 to 37) and category (1 to 5);
    details; police, safeguarding and lost or vulnerable person flags; whether it
    is a duplicate of another call; and each patient's age, sex, PRF number and
    outcome.
  - Units are assigned to a call and move through **Assigned, En route, On scene,
    Moving patient, At destination, Clear**, or **Stood down** at any point, each
    timestamped with one tap and correctable afterwards. Moving patient asks for a
    destination: a location, or for an ambulance a hospital, with a **Blue light /
    pre-alert** tick that opens an ATMIST pre-alert with ETA, who it was passed to,
    and whether it went direct or via NHS ambulance control (with their CAD number).
    Clear or stood down sends the unit back to the standby point you choose.
  - An NHS ambulance request records when it was asked for, the NHS CAD number and
    category given, when the NHS crew arrived and when the patient was handed over.
  - Each call has its own timestamped log. A call closes once its units are clear
    and each patient (or the call, when there was no patient) has an outcome.
  - The board's **Break** and **Unavailable** buttons record a break (a length or a
    finish time, with a countdown and a beep when it is over) or unavailable time
    with a reason.
  - Alerts: a call with no unit after a set time, a unit on scene with no update for
    a set time (welfare check), a break that has run over, and the hourly treatment
    centre count when it is due.
- **Treatment centre:** the hourly count of patients in each treatment centre, with notes. Add
  as many treatment centres as the event has under Locations; each has its own count and its
  own reminder when an hour has passed since its last count.
- **Control log:** timestamped entries that are not calls, and **METHANE** messages
  for a major incident, each saved to the log and printed as its own PDF.
- **Report:** the end-of-event report PDF, a zip with every call log (and METHANE
  message) as its own PDF, export and import of the whole CAD, and **Start a new
  event**, which clears the calls and logs and keeps the setup.

## The report

Calls, patients and conveyances, with patients and hospital transfers per 1,000
attendees when the crowd size is set; response times (call received to first unit
on scene, and unit assigned to on scene: average, median and longest, overall and
by category); calls per hour, by MPDS protocol, by category and by how they came
in; the police, safeguarding and vulnerable person counts; outcomes; conveyances
to hospital with pre-alerts and NHS CAD numbers; NHS ambulance requests and their
waits; each unit's calls, time on calls, hospital turnaround, breaks and
unavailable time; the treatment centre counts, centre by centre; the control log; and METHANE
messages. Duplicate calls are kept in the call logs but left out of the figures.

## what3words

Every what3words address gets a link to see it on the what3words map. With a
what3words API key in Setup (a free key is enough), the CAD also suggests real
addresses and the nearest place as you type one, to catch misheard words. The key
is kept in this browser only, apart from the CAD, so it is never in an export or
a backup. Suggestions need an internet connection; without one, the address is
still recorded.

## Files

| File | What it does |
|------|--------------|
| `index.html`, `app.js` | The CAD page |
| `data.js` | The lists (MPDS, categories, outcomes), cleaning of saved and opened data, unit status, alerts and the report's statistics |
| `pdf.js` | Call logs, the report, METHANE, and the paper fallback pack |
| `zip.js` | Builds the zip of call logs in the browser |
| `styles.css` | Additions to the Bag Tracker's stylesheet |
| `test/smoke.js` | `node event-cad/test/smoke.js` |

It uses the site's `../shared.js`, `../theme.js` and the bundled jsPDF in
`../vendor/`. Provided as is, with no warranty: it records what you type and does
not triage or dispatch. Follow your organisation's control room procedures.
