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
  // Confirms are accepted; a prompt takes the name it suggests.
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? d.defaultValue() : undefined));
  await page.goto(PAGE);

  // Builds the PDF from what is stored, as the page would.
  const pdf = () => page.evaluate(() => {
    const doc = window.DeploymentPDF.build(JSON.parse(localStorage.getItem("deployment-maker/v1")));
    return { pages: doc.internal.getNumberOfPages(), raw: doc.output(),
      perPage: doc.internal.pages.slice(1).map((pg) => pg.join("\n")) };
  });
  const saveJson = async (button) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(button)]);
    const file = path.join(os.tmpdir(), "smoke-" + dl.suggestedFilename());
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  const opened = (name) => page.waitForFunction(
    (n) => document.getElementById("openResult").textContent.includes(n), name);

  // Nothing to print yet, or to save.
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /at least one unit/);
  await page.click("#exportBtn");
  assert.match(await page.textContent("#saveResult"), /nothing to save/);

  // The company comes from the saved profile without being asked.
  await page.click(".tab[data-tab=setup]");
  assert.ok((await page.textContent("#companySummary")).includes("No company details"));
  assert.ok(await page.locator("#companyUseBtn").isHidden());
  await page.evaluate(() => {
    localStorage.setItem("company-profile/v1", JSON.stringify({
      companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890", companyAddress: "",
      cqcRegistered: true, cqcNumber: "1-234567890" }));
    // Bags set up in the other tools, offered as suggestions for bag numbers.
    localStorage.setItem("bag-tracker/v1", JSON.stringify({ bagNumber: "KB-07, KB-08", pouches: [] }));
    localStorage.setItem("drug-bag-tracker/v2", JSON.stringify({ docs: { bag: { setup: { bagNumber: "DB-09" } } } }));
  });
  await page.reload();
  const options = (id) => page.locator("#" + id + " option").evaluateAll((os) => os.map((o) => o.value));
  assert.deepStrictEqual(await options("kitBagList"), ["KB-07", "KB-08"]);
  assert.deepStrictEqual(await options("drugBagList"), ["DB-09"]);
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
  assert.ok(await alpha.getByLabel("Kit bag", { exact: true }).isChecked(), "a new unit has a kit bag");
  assert.ok(await alpha.getByLabel("Drug bag", { exact: true }).isChecked(), "and a drug bag");
  eq(await alpha.getByLabel("Kit bag number").getAttribute("list"), "kitBagList", "kit bag numbers are suggested");
  eq(await alpha.getByLabel("Drug bag number").getAttribute("list"), "drugBagList");
  await alpha.getByLabel("Kit bag number").fill("KB-01");
  await alpha.getByLabel("Drug bag number").fill("DB-02");
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
  // A foot team carries a kit bag (number given out on the day) but no drug bag.
  await foot.getByLabel("Drug bag", { exact: true }).uncheck();
  assert.ok(await foot.getByLabel("Drug bag number").isHidden(), "no drug bag, no number to fill in");
  assert.ok(await foot.getByLabel("Kit bag number").isVisible());
  await people(foot).nth(0).getByLabel("Name").fill("Ali Khan");
  await people(foot).nth(0).getByLabel("Clinical grade").fill("FREC 4");
  await foot.getByRole("button", { name: "+ Add person" }).click();
  await people(foot).nth(1).getByLabel("Clinical grade").fill("First responder");
  eq(await page.textContent("#unitCount"), "2");

  // Blanks are allowed, and the generate tab says what will print empty.
  await page.click(".tab[data-tab=generate]");
  eq(await page.textContent("#blankNote"),
    "Left blank to fill in by hand on the printed sheet: 1 name, 1 kit bag number.");

  const sheet = await pdf();
  eq(sheet.pages, 2, "the log, then the radio list");
  for (const s of ["DEPLOYMENT LOG", "Northern Event Medical Ltd", "CQC 1-234567890", "18/07/2026",
    "Summer Music Festival", "Riverside Park", "J. Smith", "2 / 4", "01234 567890", "ALPHA 1",
    "AMBULANCE", "VEHICLE REG", "AB12 CDE", "LOCATION", "Main stage", "KB-01", "DB-02", "FOOT 1", "ROAMING",
    "Sam Patel", "Paramedic", "R4", "MANAGER", "Jo Bloggs", "Ali Khan", "FREC 4", "First responder",
    "SIGNED IN", "BREAK STARTED", "BREAK ENDED", "STOOD DOWN", "SIGNATURE", "RADIO LIST"]) {
    assert.ok(sheet.raw.includes(s), "PDF missing " + s);
  }
  // A box per bag a unit has: kit bags on both units, a drug bag only on the ambulance.
  const count = (raw, label) => raw.split("(" + label + ")").length - 1;
  eq(count(sheet.raw, "KIT BAG"), 2);
  eq(count(sheet.raw, "DRUG BAG"), 1);
  assert.ok(!sheet.raw.includes("______"), "blanks are boxes to write in, not lines in a dark bar");
  const [dlPdf] = await Promise.all([page.waitForEvent("download"), page.click("#generateBtn")]);
  eq(dlPdf.suggestedFilename(), "Deployment-Summer-Music-Festival-Riverside-Park-2026-07-18.pdf");

  // Save the whole deployment, then as a plan for the venue.
  const full = await saveJson("#exportBtn");
  eq(full.json.format, "deployment-maker/deployment");
  eq(full.json.units[0].staff[0].name, "Sam Patel");
  const plan = await saveJson("#planFileBtn");
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
  eq(a1.hasKitBag, true);
  eq(a1.kitBag, "");
  eq(a1.hasDrugBag, true);
  eq(a1.drugBag, "");
  eq(plan.json.units[1].hasDrugBag, false, "a plan remembers which units have no drug bag");
  const post = { name: "", radio: "", signedIn: "", breakStart: "", breakEnd: "", stoodDown: "" };
  assert.deepStrictEqual(a1.staff, [
    Object.assign({}, post, { grade: "Paramedic", manager: true }),
    Object.assign({}, post, { grade: "EMT", manager: false })]);
  eq(plan.json.units[1].roaming, true);

  // ...and as a plan kept on this device, listed on the Event tab.
  await page.click("#planBtn");
  assert.match(await page.textContent("#saveResult"), /Saved the plan .Riverside Park. on this device/);
  const planRow = page.locator(".plan-row", { hasText: "Riverside Park" });
  assert.match(await planRow.textContent(), /2 units/);

  // Clearing keeps the company; the plan brings the units back with the names blank.
  await page.click("#resetAll");
  eq(await page.textContent("#unitCount"), "0");
  eq(await page.inputValue("#venue"), "");
  assert.ok((await page.textContent("#companySummary")).includes("Northern Event Medical Ltd"));
  await planRow.getByRole("button", { name: "Open" }).click();
  await opened("Riverside Park");
  eq(await page.textContent("#unitCount"), "2");
  eq(await page.inputValue("#venue"), "Riverside Park");
  eq(await people(alpha).nth(0).getByLabel("Name").inputValue(), "");
  eq(await people(alpha).nth(0).getByLabel("Clinical grade").inputValue(), "Paramedic");
  await page.click(".tab[data-tab=generate]");
  eq(await page.textContent("#blankNote"),
    "Left blank to fill in by hand on the printed sheet: 4 names, 1 vehicle registration, 2 kit bag numbers, " +
    "1 drug bag number.");
  const blankSheet = await pdf();
  eq(count(blankSheet.raw, "VEHICLE REG"), 1, "a blank registration still gets its box");
  eq(count(blankSheet.raw, "KIT BAG"), 2);
  assert.ok(!blankSheet.raw.includes("KB-01"), "a plan prints no bag numbers");
  assert.ok(!blankSheet.raw.includes("Sam Patel"), "a plan prints no names");
  assert.ok(!blankSheet.raw.includes("______"), "a blank date is a box to write in too, not a line");

  // The full deployment opens back in over the plan (opening is on the first tab).
  await page.click(".tab[data-tab=setup]");
  await page.setInputFiles("#openFile", full.file);
  await opened(full.name);
  eq(await people(alpha).nth(0).getByLabel("Name").inputValue(), "Sam Patel");
  assert.ok(!(await foot.getByLabel("Drug bag", { exact: true }).isChecked()));

  // A file saved before the bag ticks existed opens with both bags ticked, as it printed then.
  const older = JSON.parse(JSON.stringify(full.json));
  older.units.forEach((u) => { delete u.hasKitBag; delete u.hasDrugBag; });
  const olderFile = path.join(os.tmpdir(), "smoke-older-deployment.json");
  fs.writeFileSync(olderFile, JSON.stringify(older));
  await page.setInputFiles("#openFile", olderFile);
  await opened("smoke-older-deployment.json");
  assert.ok(await foot.getByLabel("Drug bag", { exact: true }).isChecked());
  await page.setInputFiles("#openFile", full.file);
  await opened(full.name);

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

  // On the day: each button stamps the time now.
  const at = (hhmm) => page.clock.setFixedTime(new Date("2026-07-18T" + hhmm + ":00"));
  const row = (name) => page.locator(".day-row", { hasText: name });
  const state = (name) => row(name).locator(".day-status").textContent();
  const press = (name, label) => row(name).getByRole("button", { name: label }).click();
  // Off by default: no tab until it is turned on.
  await page.click(".tab[data-tab=setup]");
  assert.ok(await page.locator(".tab[data-tab=day]").isHidden(), "On the day is hidden until wanted");
  eq(await page.textContent("#generateTab"), "3. Generate");
  await page.check("#useDay");
  eq(await page.textContent("#generateTab"), "4. Generate");
  await page.click(".tab[data-tab=day]");
  eq(await state("Sam Patel"), "Not signed in");
  await at("09:05");
  await press("Sam Patel", "Sign in");
  eq(await state("Sam Patel"), "On duty");
  eq(await row("Sam Patel").getByLabel("Signed in").inputValue(), "09:05");
  await at("12:30");
  await press("Sam Patel", "Start break");
  eq(await state("Sam Patel"), "On break");
  await at("13:00");
  await press("Sam Patel", "End break");
  eq(await state("Sam Patel"), "On duty");
  await at("17:45");
  await press("Sam Patel", "Stand down");
  eq(await state("Sam Patel"), "Stood down");
  eq(await row("Sam Patel").getByRole("button").count(), 0, "nothing left to press");
  // Standing down without a break.
  await at("09:10");
  await press("Jo Bloggs", "Sign in");
  await at("16:00");
  await press("Jo Bloggs", "Stand down");
  eq(await state("Jo Bloggs"), "Stood down");
  // A time can be typed over, or cleared to undo.
  await press("Ali Khan", "Sign in");
  await row("Ali Khan").getByLabel("Signed in").fill("");
  eq(await state("Ali Khan"), "Not signed in");
  await row("Ali Khan").getByLabel("Signed in").fill("09:25");
  eq(await state("Ali Khan"), "On duty");
  // A post with no name yet can be named as the person arrives.
  const unnamed = page.locator(".day-row").filter({ has: page.locator("input[aria-label=Name]") });
  await unnamed.getByLabel("Name").fill("Kim Lee");
  await at("09:30");
  await unnamed.getByRole("button", { name: "Sign in" }).click();
  eq(await state("Kim Lee"), "On duty");
  eq(await page.textContent("#daySummary"), ["2 on duty", "0 on break", "2 stood down", "0 not signed in"].join("  \u00b7  "));

  // The times print on the log, and the radio list can be left off.
  const timed = await pdf();
  for (const s of ["09:05", "12:30", "13:00", "17:45", "16:00", "09:25", "Kim Lee"]) {
    assert.ok(timed.raw.includes("(" + s + ")"), "log missing " + s);
  }
  await page.click(".tab[data-tab=generate]");
  await page.uncheck("#radioList");
  const noRadio = await pdf();
  assert.ok(!noRadio.raw.includes("RADIO LIST") && noRadio.pages === timed.pages - 1, "no radio list page");
  await page.check("#radioList");

  // Copy makes the next callsign with the same set-up and nobody on it yet.
  await page.click(".tab[data-tab=units]");
  await alpha.getByRole("button", { name: "Copy unit" }).click();
  const copy = page.locator(".unit").nth(1);
  eq(await copy.getByLabel("Callsign").inputValue(), "Alpha 2");
  assert.ok(await copy.getByLabel("Ambulance").isChecked());
  eq(await copy.getByLabel("Location").inputValue(), "Main stage");
  eq(await copy.getByLabel("Vehicle registration").inputValue(), "");
  eq(await copy.getByLabel("Kit bag number").inputValue(), "");
  eq(await people(copy).count(), 2);
  eq(await people(copy).nth(0).getByLabel("Name").inputValue(), "");
  eq(await people(copy).nth(0).getByLabel("Clinical grade").inputValue(), "Paramedic");
  assert.ok(await people(copy).nth(0).getByLabel("Manager").isChecked());
  await copy.getByRole("button", { name: "Remove unit" }).click();
  eq(await page.textContent("#unitCount"), "2");

  // Everything survives a reload, times and saved plans included.
  await page.reload();
  eq(await page.textContent("#unitCount"), "2");
  eq(await page.inputValue("#madeBy"), "J. Smith");
  await page.click(".tab[data-tab=day]");
  eq(await state("Sam Patel"), "Stood down");
  await page.click("#clearTimes");
  eq(await state("Sam Patel"), "Not signed in", "clearing the times starts the day again");
  await page.click(".tab[data-tab=setup]");
  await planRow.getByRole("button", { name: "Delete" }).click();
  eq(await page.locator(".plan-row").count(), 0);
  assert.ok(await page.locator("#planEmpty").isVisible());

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
  const logPages = big.perPage.filter((t) => !t.includes("RADIO LIST") && !t.includes("Radio list"));
  assert.ok(logPages.length < big.pages, "the radio list follows the log");
  logPages.forEach((text, i) => assert.ok(text.includes("(BREAK STARTED)"), "column headings on page " + (i + 1)));
  assert.ok(big.perPage.some((t) => t.includes("Radio list")), "a long radio list carries on over a page");
  // Each unit has its own headings.
  assert.ok(big.raw.split("(BREAK STARTED)").length - 1 >= 14, "column headings with every unit");
  assert.ok(big.raw.includes("Person 11-4"));

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
