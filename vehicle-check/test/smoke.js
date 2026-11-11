/* Vehicle Check smoke test. Run with: node test/smoke.js (needs Playwright). */
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PAGE = "file://" + path.join(__dirname, "..", "index.html");
const eq = (a, b, m) => assert.strictEqual(a, b, m);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(PAGE);

  const pdf = () => page.evaluate(() => {
    const doc = window.VehicleCheckPDF.build(JSON.parse(localStorage.getItem("vehicle-check/v1")));
    return { pages: doc.internal.getNumberOfPages(), raw: doc.output() };
  });
  const row = (name) => page.locator(".check-row-item", { hasText: name });
  const mark = (name, status) => row(name).getByRole("button", { name: status, exact: true }).click();
  const pressed = (name, status) => row(name).getByRole("button", { name: status, exact: true }).getAttribute("aria-pressed");

  // Nothing to save until the vehicle is named; a blank sheet still prints, for checks on paper.
  await page.click(".tab[data-tab=generate]");
  await page.click("#exportBtn");
  assert.match(await page.textContent("#saveResult"), /registration or callsign/);
  const blankSheet = await pdf();
  for (const s of ["VEHICLE DAILY CHECK", "OUTSIDE", "SALOON", "Main oxygen cylinder", "FIT FOR SERVICE", "CHECKED BY"]) {
    assert.ok(blankSheet.raw.includes(s), "blank sheet missing " + s);
  }

  // The company comes from the saved profile.
  await page.evaluate(() => localStorage.setItem("company-profile/v1", JSON.stringify({
    companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890", cqcRegistered: true, cqcNumber: "1-234567890" })));
  await page.reload();
  assert.ok((await page.textContent("#companySummary")).includes("Northern Event Medical Ltd"));

  for (const [id, v] of [["callsign", "Alpha 1"], ["reg", "ab12 cde"], ["makeModel", "Mercedes Sprinter"],
    ["mileage", "84213"], ["checkedBy", "J. Smith"], ["date", "2027-07-17"], ["time", "07:40"]]) await page.fill("#" + id, v);
  await page.selectOption("#fuel", "3/4");

  // Each item: OK, Defect or N/A; pressing the chosen one again clears it.
  await page.click(".tab[data-tab=checks]");
  assert.match(await page.textContent("#checkSummary"), /^0 OK .* 30 not checked$/);
  await mark("Horn", "OK");
  eq(await pressed("Horn", "OK"), "true");
  await mark("Horn", "OK");
  eq(await pressed("Horn", "OK"), "false", "pressing again clears it");
  await mark("Tyres and wheels", "Defect");
  assert.ok(await page.getByLabel("Note for Tyres and wheels").isVisible(), "a defect asks for a note");
  eq(await page.textContent("#defectCount"), "1");

  // A defect with no note cannot be printed.
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /Add a note to the defect .Tyres and wheels./);
  await page.click(".tab[data-tab=checks]");
  await page.getByLabel("Note for Tyres and wheels").fill("Nearside rear tyre worn to 2mm. Booked in.");
  await mark("Sat nav", "N/A");
  await page.click("#allOk");
  eq(await page.textContent("#checkSummary"), "28 OK  ·  1 defect  ·  1 N/A  ·  0 not checked");

  // Editing the checklist: add and remove items, kept for next time.
  await page.click("#editToggle");
  await page.getByLabel("New check for Equipment").fill("Spare wheel and jack");
  await page.getByLabel("New check for Equipment").press("Enter");
  await page.getByRole("button", { name: "Remove Spill kit" }).click();
  await page.click("#editToggle");
  assert.ok(await row("Spare wheel and jack").isVisible());
  eq(await row("Spill kit").count(), 0);
  await mark("Spare wheel and jack", "OK");

  await page.click(".tab[data-tab=generate]");
  await page.check("#fitYes");
  await page.fill("#reportedTo", "Fleet manager, 07:55");
  const sheet = await pdf();
  for (const s of ["Northern Event Medical Ltd", "CQC 1-234567890", "17/07/2027", "Alpha 1", "AB12 CDE",
    "Mercedes Sprinter", "84213", "3/4", "J. Smith", "07:40", "DEFECTS \\(1\\)", "Tyres and wheels: Nearside rear tyre worn",
    "Fleet manager, 07:55", "Spare wheel and jack"]) {
    assert.ok(sheet.raw.includes(s), "sheet missing " + s);
  }
  assert.ok(!sheet.raw.includes("(Spill kit)"), "a removed check is not printed");
  const [dlPdf] = await Promise.all([page.waitForEvent("download"), page.click("#generateBtn")]);
  eq(dlPdf.suggestedFilename(), "Vehicle-check-ab12-cde-2027-07-17.pdf");

  // Save, then a new check keeps the vehicle and checklist but clears the results.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const file = path.join(os.tmpdir(), "smoke-vehicle-check.json");
  await dl.saveAs(file);
  eq(JSON.parse(fs.readFileSync(file, "utf8")).format, "vehicle-check/check");
  await page.click("#newCheck");
  eq(await page.inputValue("#reg"), "ab12 cde");
  eq(await page.inputValue("#mileage"), "");
  assert.ok((await page.inputValue("#date")).length === 10, "today's date is filled in");
  await page.click(".tab[data-tab=checks]");
  assert.ok(await row("Spare wheel and jack").isVisible(), "the edited checklist is kept");
  eq(await pressed("Horn", "OK"), "false");
  eq(await page.textContent("#defectCount"), "0");

  // The saved check opens back in; a file from elsewhere changes nothing.
  await page.click(".tab[data-tab=vehicle]");
  await page.setInputFiles("#openFile", { name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.waitForSelector("#openResult.bad");
  await page.setInputFiles("#openFile", file);
  await page.waitForSelector("#openResult.good");
  eq(await page.inputValue("#mileage"), "84213");
  await page.reload();
  eq(await page.inputValue("#checkedBy"), "J. Smith", "it survives a reload");
  await page.click(".tab[data-tab=checks]");
  eq(await pressed("Tyres and wheels", "Defect"), "true");

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
