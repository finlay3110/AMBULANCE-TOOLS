/* Deployment Maker smoke test. Run with: node test/smoke.js (needs Playwright). */
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PAGE = "file://" + path.join(__dirname, "..", "index.html");
const eq = (a, b, m) => assert.strictEqual(a, b, m);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(PAGE);

  // Builds the PDF from what is stored, as the page would.
  const pdf = () => page.evaluate(() => {
    const doc = window.DeploymentPDF.build(JSON.parse(localStorage.getItem("deployment-maker/v1")));
    return { pages: doc.internal.getNumberOfPages(), raw: doc.output() };
  });
  const saveJson = async (button) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(button)]);
    const file = path.join(os.tmpdir(), "smoke-" + dl.suggestedFilename());
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  const opened = (name) => page.waitForFunction(
    (n) => document.getElementById("openResult").textContent.includes(n), name);

  // Nothing to print yet.
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /at least one unit/);

  // The company comes from the saved profile without being asked.
  await page.click(".tab[data-tab=setup]");
  assert.ok((await page.textContent("#companySummary")).includes("No company details"));
  assert.ok(await page.locator("#companyUseBtn").isHidden());
  await page.evaluate(() => localStorage.setItem("company-profile/v1", JSON.stringify({
    companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890", companyAddress: "",
    cqcRegistered: true, cqcNumber: "1-234567890" })));
  await page.reload();
  assert.ok((await page.textContent("#companySummary")).includes("Northern Event Medical Ltd"));
  assert.ok((await page.textContent("#companySummary")).includes("CQC 1-234567890"));
  assert.ok(await page.locator("#companyUseBtn").isVisible());

  await page.fill("#eventName", "Summer Music Festival");
  await page.fill("#venue", "Riverside Park");
  await page.fill("#eventDate", "2026-07-18");
  await page.fill("#madeBy", "J. Smith");

  // An ambulance with a crew of two.
  await page.click(".tab[data-tab=units]");
  await page.fill("#unitCallsign", "Alpha 1");
  await page.press("#unitCallsign", "Enter");
  const alpha = page.locator(".unit").nth(0);
  const people = (unit) => unit.locator(".staff-row:not(.staff-cols)");
  eq(await people(alpha).count(), 1, "a new unit starts with one person");
  assert.ok(await alpha.getByLabel("Vehicle registration").isHidden());
  await alpha.getByLabel("Ambulance").check();
  assert.ok(await alpha.getByLabel("Vehicle registration").isVisible(), "an ambulance asks for its registration");
  await alpha.getByLabel("Vehicle registration").fill("ab12 cde");
  await alpha.getByLabel("Location").fill("Main stage");
  await alpha.getByLabel("Kit bag").fill("KB-01");
  await alpha.getByLabel("Drug bag").fill("DB-02");
  await people(alpha).nth(0).getByLabel("Name").fill("Sam Patel");
  await people(alpha).nth(0).getByLabel("Clinical grade").fill("Paramedic");
  await people(alpha).nth(0).getByLabel("Radio").fill("R4");
  await people(alpha).nth(0).getByLabel("Manager").check();
  await alpha.getByRole("button", { name: "+ Add person" }).click();
  eq(await people(alpha).count(), 2);
  eq(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Name",
    "the new row is ready to type in");
  await people(alpha).nth(1).getByLabel("Name").fill("Jo Bloggs");
  await people(alpha).nth(1).getByLabel("Clinical grade").fill("EMT");

  // A roaming foot team with one post still to fill.
  await page.fill("#unitCallsign", "Foot 1");
  await page.click("#unitForm button");
  const foot = page.locator(".unit").nth(1);
  await foot.getByLabel("Roaming").check();
  assert.ok(await foot.getByLabel("Location").isHidden(), "roaming needs no location");
  await people(foot).nth(0).getByLabel("Name").fill("Ali Khan");
  await people(foot).nth(0).getByLabel("Clinical grade").fill("FREC 4");
  await foot.getByRole("button", { name: "+ Add person" }).click();
  await people(foot).nth(1).getByLabel("Clinical grade").fill("First responder");
  eq(await page.textContent("#unitCount"), "2");

  // Blanks are allowed, and the generate tab says what will print empty.
  await page.click(".tab[data-tab=generate]");
  eq(await page.textContent("#blankNote"), "Left blank to fill in by hand on the printed sheet: 1 name.");

  const sheet = await pdf();
  eq(sheet.pages, 1);
  for (const s of ["DEPLOYMENT LOG", "Northern Event Medical Ltd", "CQC 1-234567890", "18/07/2026",
    "Summer Music Festival", "Riverside Park", "J. Smith", "2 / 4", "01234 567890", "ALPHA 1",
    "AMBULANCE  REG AB12 CDE", "LOCATION: Main stage", "KIT BAG: KB-01", "DRUG BAG: DB-02", "FOOT 1", "ROAMING",
    "Sam Patel", "Paramedic", "R4", "Yes", "Jo Bloggs", "Ali Khan", "FREC 4", "First responder",
    "Signed in", "Break started", "Stood down", "Signature"]) {
    assert.ok(sheet.raw.includes(s), "PDF missing " + s);
  }
  const [dlPdf] = await Promise.all([page.waitForEvent("download"), page.click("#generateBtn")]);
  eq(dlPdf.suggestedFilename(), "Deployment-Summer-Music-Festival-Riverside-Park-2026-07-18.pdf");

  // Save the whole deployment, then as a plan for the venue.
  const full = await saveJson("#exportBtn");
  eq(full.json.format, "deployment-maker/deployment");
  eq(full.json.units[0].staff[0].name, "Sam Patel");
  const plan = await saveJson("#planBtn");
  eq(plan.name, "Plan-Riverside-Park.json");
  eq(plan.json.format, "deployment-maker/plan");
  eq(plan.json.venue, "Riverside Park");
  eq(plan.json.eventName, "Summer Music Festival");
  eq(plan.json.eventDate, "");
  eq(plan.json.madeBy, "");
  eq(plan.json.company, undefined, "a plan carries no company");
  const a1 = plan.json.units[0];
  eq(a1.callsign, "Alpha 1");
  eq(a1.ambulance, true);
  eq(a1.reg, "");
  eq(a1.location, "Main stage");
  eq(a1.kitBag, "");
  eq(a1.drugBag, "");
  assert.deepStrictEqual(a1.staff, [
    { name: "", grade: "Paramedic", radio: "", manager: true },
    { name: "", grade: "EMT", radio: "", manager: false }]);
  eq(plan.json.units[1].roaming, true);

  // Clearing keeps the company; the plan brings the units back with the names blank.
  await page.click("#resetAll");
  eq(await page.textContent("#unitCount"), "0");
  eq(await page.inputValue("#venue"), "");
  assert.ok((await page.textContent("#companySummary")).includes("Northern Event Medical Ltd"));
  await page.setInputFiles("#openFile", plan.file);
  await opened(plan.name);
  eq(await page.textContent("#unitCount"), "2");
  eq(await page.inputValue("#venue"), "Riverside Park");
  eq(await people(alpha).nth(0).getByLabel("Name").inputValue(), "");
  eq(await people(alpha).nth(0).getByLabel("Clinical grade").inputValue(), "Paramedic");
  await page.click(".tab[data-tab=generate]");
  eq(await page.textContent("#blankNote"),
    "Left blank to fill in by hand on the printed sheet: 4 names, 1 vehicle registration.");
  const blankSheet = await pdf();
  assert.ok(blankSheet.raw.includes("REG ______________"), "a blank registration gets a line to write on");
  assert.ok(blankSheet.raw.includes("KIT BAG: ______________"));
  assert.ok(!blankSheet.raw.includes("Sam Patel"), "a plan prints no names");

  // The full deployment opens back in over the plan (opening is on the first tab).
  await page.click(".tab[data-tab=setup]");
  await page.setInputFiles("#openFile", full.file);
  await opened(full.name);
  eq(await people(alpha).nth(0).getByLabel("Name").inputValue(), "Sam Patel");

  // A file from elsewhere changes nothing.
  await page.setInputFiles("#openFile", { name: "junk.json", mimeType: "application/json",
    buffer: Buffer.from("{\"units\":[]}") });
  await page.waitForSelector("#openResult.bad");
  eq(await page.textContent("#unitCount"), "2");

  // Company details from a company file, and back to the saved profile.
  await page.setInputFiles("#companyFile", { name: "c.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "drug-bag-tracker/company", version: 1, companyName: "Other Medical" })) });
  await page.waitForSelector("#companyResult.good");
  assert.ok((await page.textContent("#companySummary")).includes("Other Medical"));
  await page.click("#companyUseBtn");
  assert.ok((await page.textContent("#companySummary")).includes("Northern Event Medical Ltd"));

  // A unit needs a callsign to print.
  await page.click(".tab[data-tab=units]");
  await foot.getByLabel("Callsign").fill("");
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /Unit 2 has no callsign/);
  await page.click(".tab[data-tab=units]");
  await foot.getByLabel("Callsign").fill("Foot 1");

  // Everything survives a reload.
  await page.reload();
  eq(await page.textContent("#unitCount"), "2");
  eq(await page.inputValue("#madeBy"), "J. Smith");

  // A big deployment runs over pages, with the column headings on each one.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("deployment-maker/v1"));
    for (let i = 0; i < 12; i++) {
      d.units.push({ callsign: "Unit " + i, roaming: true, staff: [1, 2, 3, 4].map((n) =>
        ({ name: "Person " + i + "-" + n, grade: "EMT" })) });
    }
    localStorage.setItem("deployment-maker/v1", JSON.stringify(d));
  });
  await page.reload();
  eq(await page.textContent("#unitCount"), "14");
  const big = await pdf();
  assert.ok(big.pages >= 3, "a big deployment should run over pages, got " + big.pages);
  eq(big.raw.split("Break started").length - 1, big.pages, "column headings on every page");
  assert.ok(big.raw.includes("Person 11-4"));

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
