/* End-to-end check: make a profile, save it, and import the file into both
   trackers. Run with: node test/smoke.js (needs Playwright). */
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const url = (p) => "file://" + path.join(ROOT, p);
// 2x1 red PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwH4QZYAwAX+sH+fwNtHwAAAAASUVORK5CYII=", "base64");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = async (p) => {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errors.push(p + ": " + e.message));
    pg.on("dialog", (d) => d.accept());
    await pg.goto(url(p));
    return pg;
  };

  /* ---- make and save a profile ---- */
  const prof = await page("company-profile/index.html");
  await prof.click("#saveBtn");
  assert.match(await prof.textContent("#saveResult"), /company name/, "saving without a name must be refused");

  await prof.fill("#companyName", "Northern Event Medical Ltd");
  await prof.fill("#companyPhone", "01234 567890");
  await prof.fill("#companyAddress", "Unit 4, Example Way\nTownsville");
  assert.ok(await prof.locator("#f-cqcNumber").isHidden());
  await prof.check("#cqcRegistered");
  await prof.click("#saveBtn");
  assert.match(await prof.textContent("#saveResult"), /CQC registration number/, "ticked CQC needs a number");
  await prof.fill("#cqcNumber", "1-234567890");
  await prof.setInputFiles("#logoFile", { name: "logo.png", mimeType: "image/png", buffer: PNG });
  await prof.waitForSelector("#logoPreview:not([hidden])");

  const [dl] = await Promise.all([prof.waitForEvent("download"), prof.click("#saveBtn")]);
  assert.strictEqual(dl.suggestedFilename(), "Company-Northern-Event-Medical-Ltd.json");
  const file = path.join(os.tmpdir(), "smoke-company-profile.json");
  await dl.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(saved.format, "drug-bag-tracker/company");
  assert.strictEqual(saved.cqcRegistered, true);
  assert.strictEqual(saved.cqcNumber, "1-234567890");
  assert.ok(saved.logo.startsWith("data:image/png") && saved.logoW === 2 && saved.logoH === 1);

  // Survives a reload, and a saved file opens back in for editing.
  await prof.reload();
  assert.strictEqual(await prof.inputValue("#companyName"), "Northern Event Medical Ltd");
  await prof.click("#resetAll");
  assert.strictEqual(await prof.inputValue("#companyName"), "");
  await prof.setInputFiles("#openFile", file);
  await prof.waitForSelector("#openResult.good");
  assert.strictEqual(await prof.inputValue("#cqcNumber"), "1-234567890");

  /* ---- import into the Bag Tracker ---- */
  const bag = await page("bag-tracker/index.html");
  await bag.fill("#bagName", "Response bag");
  await bag.setInputFiles("#companyFile", { name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{\"a\":1}") });
  await bag.waitForSelector("#companyResult.bad");
  assert.strictEqual(await bag.inputValue("#companyName"), "", "a bad file must change nothing");
  await bag.setInputFiles("#companyFile", file);
  await bag.waitForSelector("#companyResult.good");
  assert.strictEqual(await bag.inputValue("#companyName"), "Northern Event Medical Ltd");
  assert.strictEqual(await bag.inputValue("#companyPhone"), "01234 567890");
  assert.strictEqual(await bag.inputValue("#companyAddress"), "Unit 4, Example Way\nTownsville");
  assert.ok(await bag.isChecked("#cqcRegistered"), "CQC registration should come across");
  assert.strictEqual(await bag.inputValue("#cqcNumber"), "1-234567890");
  assert.strictEqual(await bag.inputValue("#bagName"), "Response bag", "bag details must be kept");
  assert.ok(await bag.locator("#logoPreview").isVisible(), "logo should come across");
  await bag.reload();
  assert.strictEqual(await bag.inputValue("#companyName"), "Northern Event Medical Ltd", "import must be saved");

  /* ---- import into the Drug Bag Tracker (its own existing import) ---- */
  const drug = await page("drug-bag-tracker/index.html");
  await drug.setInputFiles("#companyFile", file);
  await drug.waitForSelector("#companyResult.good");
  assert.strictEqual(await drug.inputValue("#companyName"), "Northern Event Medical Ltd");
  assert.strictEqual(await drug.inputValue("#cqcNumber"), "1-234567890");
  assert.ok(await drug.isChecked("#cqcRegistered"));
  assert.ok(await drug.locator("#logoPreview").isVisible());

  /* ---- home page puts the profile first ---- */
  const home = await page("index.html");
  const first = await home.locator("main a.btn").first().getAttribute("href");
  assert.strictEqual(first, "company-profile/index.html", "company profile must be the first tool on the home page");

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
