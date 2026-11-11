# Ambulance Tools

Browser-based paperwork generators for ambulance and event-medical teams.
Everything runs locally in the browser: no server, no upload.

| Tool | Folder | What it makes |
|------|--------|---------------|
| [Company Profile](company-profile/README.md) — **start here** | `company-profile/` | A company file (name, contact, address, CQC registration, logo) that both trackers import |
| [Drug Bag Tracker](drug-bag-tracker/README.md) | `drug-bag-tracker/` | Drug bag label and usage log, controlled drugs register, drug matrix |
| [Bag Tracker](bag-tracker/README.md) | `bag-tracker/` | Kit list, checklist and sign in/out log for a medical bag |
| [Vehicle Check](vehicle-check/README.md) | `vehicle-check/` | Daily ambulance vehicle check: OK / defect / N/A on an editable checklist, defects, fit for service, signed check sheet |
| [Deployment Maker](deployment-maker/README.md) | `deployment-maker/` | A deployment log: units, callsigns, staff, grades, radios and bags, with sign-in, break and stand-down times; reusable venue plans |

`index.html` at the root is a home page that puts the Company Profile first,
then links to the trackers. Each tool links back to it from its top bar.

All the tools are provided as is, with no warranty. Read the
[disclaimer](https://finlay3110.github.io/AMBULANCE-TOOLS/disclaimer.html)
(`disclaimer.html`) before use; the Drug Bag Tracker's
[DISCLAIMER.md](drug-bag-tracker/DISCLAIMER.md) has its full details and sources.

## Hosting on GitHub Pages

The site is plain static files with relative paths. In the repository's
**Settings → Pages**, set *Source* to **GitHub Actions**. The workflow in
`.github/workflows/pages.yml` then publishes the site on every push to `main`
(or from its *Run workflow* button in the Actions tab), at:

- https://finlay3110.github.io/AMBULANCE-TOOLS/ (home page)
- https://finlay3110.github.io/AMBULANCE-TOOLS/company-profile/
- https://finlay3110.github.io/AMBULANCE-TOOLS/drug-bag-tracker/
- https://finlay3110.github.io/AMBULANCE-TOOLS/bag-tracker/
- https://finlay3110.github.io/AMBULANCE-TOOLS/deployment-maker/
- https://finlay3110.github.io/AMBULANCE-TOOLS/vehicle-check/

The empty `.nojekyll` file tells Pages to serve the files as they are.

## Offline, and on phones

Once the site has been opened with a connection, every tool opens without
one (`sw.js` keeps a copy of each page). With a connection, the newest
version is always used, so changes show as soon as they are published. The
user guide PDFs are kept once they have been opened. A page that was never
saved shows a short "You are offline" note instead of the browser's error.

To add the tools to a phone's home screen like an app:

- **Android (Chrome):** menu, then **Install app** or **Add to Home screen**.
- **iPhone or iPad (Safari):** **Share**, then **Add to Home Screen**.
- **Computer (Chrome or Edge):** the install icon in the address bar.

On an iPhone or iPad, the home-screen app keeps its own saved work,
separate from Safari. To move work across, back it up in one and restore it
in the other.

## Backing up

Saved work lives only in the browser. **Back up everything** on the home page
downloads one file with the work of every tool (company profile, bags,
registers, matrices and deployments); **Restore from backup** puts it back,
on the same or another device. Only the tools' own saved work is read and
written, nothing else stored for the site's address.

## Tests

Each tool has its own smoke test in its `test/` folder. To run them all:

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

`test/site.js` checks the home page, backup and restore, and that every tool
opens offline. GitHub runs the same tests on every push (`.github/workflows/tests.yml`), so
each pull request shows a green tick or a red cross before it is merged.
