# Ambulance Tools

Browser-based paperwork generators for ambulance and event-medical teams.
Everything runs locally in the browser: no server, no upload.

| Tool | Folder | What it makes |
|------|--------|---------------|
| [Drug Bag Tracker](drug-bag-tracker/README.md) | `drug-bag-tracker/` | Drug bag label and usage log, controlled drugs register, drug matrix |
| [Bag Tracker](bag-tracker/README.md) | `bag-tracker/` | Kit list, checklist and sign in/out log for a medical bag |

`index.html` at the root is a home page linking to both, and each tool links
back to it from its top bar.

Each tool is provided as is, with no warranty. Read its own README and
disclaimer before use.

## Hosting on GitHub Pages

The site is plain static files with relative paths. In the repository's
**Settings → Pages**, set *Source* to **GitHub Actions**. The workflow in
`.github/workflows/pages.yml` then publishes the site on every push to `main`
(or from its *Run workflow* button in the Actions tab), at:

- https://finlay3110.github.io/AMBULANCE-TOOLS/ (home page)
- https://finlay3110.github.io/AMBULANCE-TOOLS/drug-bag-tracker/
- https://finlay3110.github.io/AMBULANCE-TOOLS/bag-tracker/

The empty `.nojekyll` file tells Pages to serve the files as they are.

## Tests

Each tool has its own smoke test. Run it from that tool's folder:

```bash
cd drug-bag-tracker && npm test
```
