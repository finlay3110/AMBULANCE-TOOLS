# Company Profile

Enter your organisation's details once and save them as a file that the
other tools import:

- company name, contact number and address
- CQC registration (and number)
- logo (PNG or JPEG, scaled down to fit browser storage)

Click **Save profile** to download `Company-<name>.json`. In the Drug Bag
Tracker or the Bag Tracker, click **Import company details** and choose that
file. **Open a saved profile** loads a file back in to edit it.

The file uses the Drug Bag Tracker's existing company format
(`"format": "drug-bag-tracker/company"`), so older company files and exports
from either tracker can be opened here too. The Bag Tracker has no CQC
field, so it takes everything except the CQC registration.

Everything stays in the browser on this device. Nothing is uploaded.

Test (needs Playwright):

```bash
node test/smoke.js
```
