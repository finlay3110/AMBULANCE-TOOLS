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

  // Photos: the vehicle's six views, and up to three on a defect, each shrunk to a JPEG.
  const picture = Buffer.from((await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#3a6ea5"; g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#fff"; g.fillRect(400, 300, 800, 600);
    return c.toDataURL("image/png");
  })).split(",")[1], "base64");
  const asFile = (name) => ({ name, mimeType: "image/png", buffer: picture });
  await page.click(".tab[data-tab=vehicle]");
  await page.setInputFiles("input[aria-label='Photo: Front']", asFile("front.png"));
  await page.waitForSelector("img[alt='Front of the vehicle']");
  await page.setInputFiles("input[aria-label='Photo: Patient compartment']", asFile("saloon.png"));
  await page.waitForSelector("img[alt='Patient compartment of the vehicle']");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-check/v1")));
  assert.ok(stored.photos.front.src.startsWith("data:image/jpeg"), "photos are stored as JPEG");
  assert.ok(Math.max(stored.photos.front.w, stored.photos.front.h) <= 1000, "and shrunk");
  await page.click(".tab[data-tab=checks]");
  await page.setInputFiles("input[aria-label='Photo of the defect: Tyres and wheels']", asFile("tyre.png"));
  await page.waitForSelector("img[alt='Photo of the defect: Tyres and wheels']");
  eq(await row("Horn").locator(".defect-photos").count(), 0, "only a defect asks for photos");

  // Crew: each signs on screen; the time is recorded.
  await page.click(".tab[data-tab=generate]");
  await page.click("#addCrew");
  const crew = page.locator(".crew-row").nth(0);
  await crew.getByLabel("Name").fill("Sam Patel");
  await crew.getByLabel("Clinical grade").fill("Paramedic");
  await page.clock.setFixedTime(new Date("2027-07-17T07:50:00"));
  const pad = await crew.locator("canvas.sig-pad").boundingBox();
  await page.mouse.move(pad.x + 20, pad.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 20 + i * 20, pad.y + 60 + (i % 2 ? -25 : 25));
  await page.mouse.up();
  await page.click("#addCrew");
  await page.locator(".crew-row").nth(1).getByLabel("Name").fill("Jo Bloggs");
  await page.locator(".crew-row").nth(1).getByLabel("Clinical grade").fill("EMT");
  const signed = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-check/v1")).crew);
  assert.ok(signed[0].sig && signed[0].sig.src.startsWith("data:image/png"), "the signature is kept");
  eq(signed[0].signedAt, "07:50");
  eq(signed[1].sig, null, "not signed yet");

  await page.check("#fitYes");
  await page.fill("#reportedTo", "Fleet manager, 07:55");
  const sheet = await pdf();
  for (const s of ["Northern Event Medical Ltd", "CQC 1-234567890", "17/07/2027", "Alpha 1", "AB12 CDE",
    "Mercedes Sprinter", "84213", "3/4", "J. Smith", "07:40", "DEFECTS \\(1\\)", "Tyres and wheels: Nearside rear tyre worn",
    "Fleet manager, 07:55", "Spare wheel and jack"]) {
    assert.ok(sheet.raw.includes(s), "sheet missing " + s);
  }
  assert.ok(!sheet.raw.includes("(Spill kit)"), "a removed check is not printed");
  for (const s of ["CREW", "Sam Patel", "Paramedic", "07:50", "Jo Bloggs", "VEHICLE CHECK PHOTOS", "FRONT",
    "PATIENT COMPARTMENT", "DEFECT: Tyres and wheels"]) {
    assert.ok(sheet.raw.includes(s), "sheet missing " + s);
  }
  // The test's photos are one picture, which the PDF stores once; then the signature.
  assert.ok(sheet.raw.split("/Subtype /Image").length - 1 >= 2, "photos and the signature are in the PDF");
  const [dlPdf] = await Promise.all([page.waitForEvent("download"), page.click("#generateBtn")]);
  eq(await page.isVisible("#shareBtn"), false, "no Share button where the browser can't share files");
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
  eq(await page.locator(".defect-photos img").count(), 0, "photos are cleared for the new check");
  await page.click(".tab[data-tab=generate]");
  eq(await page.locator(".crew-row").count(), 0, "and the crew");

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

  // A QR sticker: the link opens the tool on another phone with this vehicle and checklist, ready to check.
  await page.click(".tab[data-tab=vehicle]");
  const [stickers] = await Promise.all([page.waitForEvent("download"), page.click("#stickerBtn")]);
  eq(stickers.suggestedFilename(), "QR-stickers-ab12-cde.pdf");
  const link = await page.evaluate(() => window.VehicleCheckLink());
  assert.ok(/#v=[jz][A-Za-z0-9_-]+$/.test(link), "the vehicle travels after the #");
  // A stand-in for the phone's share sheet: records the file shared.
  const fakeShare = () => {
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; return Promise.resolve(); };
  };
  const phone = await (await browser.newContext()).newPage();
  await phone.addInitScript(fakeShare);
  phone.on("pageerror", (e) => errors.push("phone: " + e.message));
  phone.on("dialog", (d) => d.accept());
  await phone.goto(link);
  await phone.waitForSelector("#scanResult:not([hidden])");
  assert.match(await phone.textContent("#scanResult"), /Ready to check ab12 cde/);
  eq(await phone.inputValue("#reg"), "ab12 cde");
  eq(await phone.inputValue("#callsign"), "Alpha 1");
  eq(new URL(phone.url()).hash, "", "the vehicle is taken out of the address");
  eq(await phone.getAttribute("#shareBtn", "hidden"), null, "phones that can share get a Share button");
  // Scanning again before any item is marked keeps what was entered (here the mileage).
  await phone.fill("#mileage", "45210");
  await phone.goto(link);
  await phone.waitForFunction(() => document.getElementById("scanResult").textContent.includes("Carrying on with today"));
  eq(await phone.inputValue("#mileage"), "45210");
  await phone.click(".tab[data-tab=checks]");
  assert.ok(await phone.locator(".check-row-item", { hasText: "Spare wheel and jack" }).isVisible(), "with your checklist");
  await phone.locator(".check-row-item", { hasText: "Horn" }).getByRole("button", { name: "OK", exact: true }).click();
  // Scanning again the same day carries on with the check in progress.
  await phone.goto(link);
  await phone.waitForFunction(() => document.getElementById("scanResult").textContent.includes("Carrying on with today"));
  await phone.click(".tab[data-tab=checks]");
  eq(await phone.locator(".check-row-item", { hasText: "Horn" }).getByRole("button", { name: "OK", exact: true })
    .getAttribute("aria-pressed"), "true");

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
