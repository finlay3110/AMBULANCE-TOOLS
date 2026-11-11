# Vehicle Check

A daily ambulance vehicle check, printed as a signed A4 check sheet.

- **Vehicle:** callsign, registration, make and model, mileage, fuel level, who
  checked it, date and time. The company comes from your saved
  [Company Profile](../company-profile/README.md).
- **Checks:** a standard checklist in sections (outside, fluids, cab, saloon,
  equipment). Mark each item **OK**, **Defect** or **N/A**; a defect asks for a
  note, and cannot be printed without one. **Mark the rest OK** fills in what is
  left. **Edit checklist** adds and removes items; your list is kept for next
  time, and **Back to the standard checklist** resets it.
- **Generate:** **Fit for service** yes or no, who defects were reported to, and
  the PDF: the vehicle, every check with its box ticked, the defects, and a
  sign-off with name, signature and date. Unchecked items print as empty
  boxes, so a blank sheet works for checks done on paper.
- **Photos:** the Vehicle tab has slots for the front, back, right side, left
  side, cab and patient compartment; a defect can carry up to three photos. On a
  phone the camera opens. Photos are shrunk to JPEGs before storing, and print
  on a photos page at the end of the sheet.
- **Crew:** everyone on the vehicle adds their name and clinical grade and signs
  on screen with a finger or the mouse, with the time recorded. The sheet shows
  each signature; anyone not signed in the app gets a row to sign by hand.
- **QR stickers:** **Download QR stickers** prints six stickers for the vehicle.
  Scanning one opens this tool with the vehicle and your checklist filled in,
  ready for the day's check (or carries on with today's check if one is under
  way on that phone). The details travel in the link after the `#`, which is
  never sent to the website. Make new stickers after changing the checklist.
- **New check** starts the next check: the vehicle and checklist stay; results,
  photos, crew, mileage, fuel, defects and sign-off are cleared, with today's date and time.
- **Save check (.json)** and **Open a saved check** keep a check as a file.

Everything stays in the browser on this device. It uses the Bag Tracker's
stylesheet and bundled jsPDF, the site's `theme.js`, and the QR code library in
`../vendor/qrcode.js` (qrcode-generator 1.4.4, MIT licence).

Test (needs Playwright): `node test/smoke.js`
