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
- **New check** starts the next check: the vehicle and checklist stay; results,
  mileage, fuel, defects and sign-off are cleared, with today's date and time.
- **Save check (.json)** and **Open a saved check** keep a check as a file.

Everything stays in the browser on this device. It uses the Bag Tracker's
stylesheet and bundled jsPDF, and the site's `theme.js`.

Test (needs Playwright): `node test/smoke.js`
