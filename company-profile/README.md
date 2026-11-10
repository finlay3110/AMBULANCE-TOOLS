# Company Profile

Enter your organisation's details once and save them as a file that the
other tools import:

- company name, contact number and address
- CQC registration (and number)
- logo (PNG or JPEG, scaled down to fit browser storage)

The profile is kept in this browser, and the other tools read it from there:
the Drug Bag Tracker and Bag Tracker offer **Use saved company profile**, and
the Deployment Maker uses it by itself.

For another device or a colleague, click **Save profile** to download
`Company-<name>.json`, then click **Import company details** in a tool and
choose that file. **Open a saved profile** loads a file back in to edit it.

The file uses the Drug Bag Tracker's existing company format
(`"format": "drug-bag-tracker/company"`), so older company files and exports
from either tracker can be opened here too. Both trackers take everything,
CQC registration included.

Everything stays in the browser on this device. Nothing is uploaded.

Test (needs Playwright):

```bash
node test/smoke.js
```
