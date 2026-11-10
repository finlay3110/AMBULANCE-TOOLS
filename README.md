# Ambulance Tools

Browser-based paperwork generators for ambulance and event-medical teams.
Everything runs locally in the browser: no server, no upload.

| Tool | Folder | What it makes |
|------|--------|---------------|
| [Company Profile](company-profile/README.md) — **start here** | `company-profile/` | A company file (name, contact, address, CQC registration, logo) that both trackers import |
| [Drug Bag Tracker](drug-bag-tracker/README.md) | `drug-bag-tracker/` | Drug bag label and usage log, controlled drugs register, drug matrix |
| [Bag Tracker](bag-tracker/README.md) | `bag-tracker/` | Kit list, checklist and sign in/out log for a medical bag |

`index.html` at the root is a home page that puts the Company Profile first,
then links to the trackers. Each tool links back to it from its top bar.

Each tool is provided as is, with no warranty. Read its own README and
disclaimer before use.

## Hosting on GitHub Pages

The site is plain static files with relative paths. In the repository's
**Settings → Pages**, set *Source* to **GitHub Actions**. The workflow in
`.github/workflows/pages.yml` then publishes the site on every push to `main`
(or from its *Run workflow* button in the Actions tab), at:

- https://finlay3110.github.io/AMBULANCE-TOOLS/ (home page)
- https://finlay3110.github.io/AMBULANCE-TOOLS/company-profile/
- https://finlay3110.github.io/AMBULANCE-TOOLS/drug-bag-tracker/
- https://finlay3110.github.io/AMBULANCE-TOOLS/bag-tracker/

The empty `.nojekyll` file tells Pages to serve the files as they are.

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

GitHub runs the same tests on every push (`.github/workflows/tests.yml`), so
each pull request shows a green tick or a red cross before it is merged.
