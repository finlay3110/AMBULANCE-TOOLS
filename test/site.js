/* Site-wide checks: the home page, backup and restore, the offline file list,
   and that every tool opens with no connection. Run with: node test/site.js */
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASE = "/AMBULANCE-TOOLS/";   // served under a folder, as GitHub Pages does
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".pdf": "application/pdf" };
const eq = (a, b, m) => assert.strictEqual(a, b, m);

function serve() {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (!rel.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
    rel = rel.slice(BASE.length) || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  return new Promise((resolve) => server.listen(0, () => resolve({
    url: "http://localhost:" + server.address().port + BASE,
    // Closed, and every open connection cut, so nothing can still be fetched.
    stop: () => new Promise((done) => { server.close(done); sockets.forEach((s) => s.destroy()); })
  })));
}

/* ---- the offline list covers every file a page loads ---- */
function checkOfflineList() {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const files = JSON.parse(sw.match(/var FILES = (\[[\s\S]*?\]);/)[1]);
  files.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), "sw.js lists a missing file: " + f));

  const pages = files.filter((f) => f.endsWith(".html"));
  const needed = new Set(["manifest.webmanifest"]);
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|data:|mailto:)/.test(ref)) continue;
      const file = path.posix.normalize(path.posix.join(path.posix.dirname(page), ref));
      // Guides are large PDFs: they are saved for offline use once opened, not up front.
      if (!file.endsWith(".pdf")) needed.add(file);
    }
  });
  JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8")).icons
    .forEach((i) => needed.add(i.src));
  needed.forEach((f) => assert.ok(files.includes(f), "sw.js does not keep " + f + " for offline use"));
  console.log("  ok   offline list: " + files.length + " files, covering " + needed.size + " that pages load");
}

/* ---- the manifest's icons are the sizes it says ---- */
function checkIcons() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  eq(manifest.start_url, "./");
  manifest.icons.forEach((icon) => {
    const png = fs.readFileSync(path.join(ROOT, icon.src));
    const size = png.readUInt32BE(16) + "x" + png.readUInt32BE(20);   // the PNG header's width and height
    eq(size, icon.sizes, icon.src + " size");
  });
  console.log("  ok   manifest icons");
}

(async () => {
  checkOfflineList();
  checkIcons();

  const site = await serve();
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => page.on("pageerror", (e) => errors.push(label + ": " + e.message));

  /* ---- home page ---- */
  const ctx = await browser.newContext({ acceptDownloads: true });
  const home = await ctx.newPage();
  watch(home, "home");
  home.on("dialog", (d) => d.accept());
  await home.goto(site.url);
  const links = await home.locator("main a.btn").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  assert.deepStrictEqual(links, ["company-profile/index.html", "drug-bag-tracker/index.html",
    "bag-tracker/index.html", "deployment-maker/index.html"], "the company profile comes first, then the tools");
  eq(await home.locator("a[href='disclaimer.html']").count(), 1, "the home page links the disclaimer");
  await home.click("a[href='disclaimer.html']");
  eq(await home.textContent("h1"), "Disclaimer");
  await home.goBack();
  console.log("  ok   home page");

  /* ---- backup and restore ---- */
  await home.click("#backupBtn");
  assert.match(await home.textContent("#backupResult"), /no saved work/);
  await home.evaluate(() => {
    localStorage.setItem("company-profile/v1", JSON.stringify({ companyName: "Northern Event Medical Ltd" }));
    localStorage.setItem("bag-tracker/v1", JSON.stringify({ bagName: "Response bag", pouches: [] }));
    localStorage.setItem("deployment-maker/v1", JSON.stringify({ venue: "Riverside Park", units: [] }));
    localStorage.setItem("another-site/thing", "not ours");   // the github.io address is shared
  });
  const [dl] = await Promise.all([home.waitForEvent("download"), home.click("#backupBtn")]);
  assert.match(dl.suggestedFilename(), /^Ambulance-Tools-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join(os.tmpdir(), "smoke-site-backup.json");
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  eq(backup.format, "ambulance-tools/backup");
  assert.deepStrictEqual(Object.keys(backup.data).sort(),
    ["bag-tracker/v1", "company-profile/v1", "deployment-maker/v1"], "only the tools' own work is backed up");
  assert.match(await home.textContent("#backupResult"), /Company Profile, Bag Tracker, Deployment Maker/);

  // Restored into a fresh browser, with an entry that is not a tool's slipped in.
  backup.data["another-site/thing"] = "overwritten";
  fs.writeFileSync(file, JSON.stringify(backup));
  const fresh = await (await browser.newContext()).newPage();
  watch(fresh, "restore");
  fresh.on("dialog", (d) => d.accept());
  await fresh.goto(site.url);
  await fresh.evaluate(() => localStorage.setItem("bag-tracker/v1", "{\"bagName\":\"old\",\"pouches\":[]}"));
  await fresh.setInputFiles("#restoreFile", { name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await fresh.waitForSelector("#backupResult.bad");
  await fresh.setInputFiles("#restoreFile", file);
  await fresh.waitForSelector("#backupResult.good");
  const restored = await fresh.evaluate(() => ({
    bag: JSON.parse(localStorage.getItem("bag-tracker/v1")).bagName,
    venue: JSON.parse(localStorage.getItem("deployment-maker/v1")).venue,
    other: localStorage.getItem("another-site/thing")
  }));
  assert.deepStrictEqual(restored, { bag: "Response bag", venue: "Riverside Park", other: null });
  await fresh.goto(site.url + "deployment-maker/index.html");
  eq(await fresh.inputValue("#venue"), "Riverside Park", "a tool carries on from the backup");
  console.log("  ok   backup and restore");

  /* ---- offline: every tool opens with the server gone ---- */
  const off = await (await browser.newContext()).newPage();
  watch(off, "offline");
  await off.goto(site.url);
  await off.evaluate(() => navigator.serviceWorker.ready);
  await off.reload();   // now under the service worker's control
  eq(await off.evaluate(() => !!navigator.serviceWorker.controller), true, "the page is offline-ready");
  await site.stop();
  // Proof the server is gone: a page never saved gets the offline note, not a 404.
  await off.goto(site.url + "never-saved.html");
  eq(await off.textContent("h1"), "You are offline");
  await off.click("text=Back to Ambulance Tools");
  eq(await off.textContent("h1"), "Ambulance Tools", "and its link goes home, still offline");
  for (const [page, title] of [["", "Ambulance Tools"], ["company-profile/index.html", "Company Profile"],
    ["drug-bag-tracker/index.html", "Drug Bag Tracker"], ["drug-bag-tracker/matrix.html", "Drug Matrix"],
    ["bag-tracker/", "Bag Tracker"], ["deployment-maker/index.html", "Deployment Maker"],
    ["disclaimer.html", "Disclaimer"]]) {
    await off.goto(site.url + page);
    assert.ok((await off.title()).length > 0 && (await off.textContent("h1")).includes(title.split(" ")[0]),
      page + " should open offline");
    // Styled, not bare: the stylesheet came from the saved copy too.
    assert.notStrictEqual(await off.evaluate(() => getComputedStyle(document.querySelector(".topbar")).display),
      "inline", page + " should be styled offline");
  }
  // A PDF can still be made: the bundled PDF library was saved as well.
  await off.goto(site.url + "deployment-maker/index.html");
  eq(await off.evaluate(() => window.DeploymentPDF.build({ units: [] }).internal.getNumberOfPages()), 1,
    "a PDF can be made offline");
  console.log("  ok   every tool opens offline");

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("site: ok");
})().catch((e) => { console.error(e); process.exit(1); });
