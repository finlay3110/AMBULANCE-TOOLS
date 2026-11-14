/* Event CAD: setup with units from Deployment Maker, calls from start to close,
   alerts, breaks, the treatment centre, control log, METHANE, the report and its
   figures, the zip of call logs, and export and import.
   Run with: node event-cad/test/smoke.js */
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PAGE = "file://" + path.join(__dirname, "..", "index.html");
const eq = (a, b, m) => assert.strictEqual(a, b, m);

/* The files in a zip, each checked against the CRC the zip gives it. */
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files = {};
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const crc = buf.readUInt32LE(at + 16), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const name = buf.slice(at + 46, at + 46 + nameLen).toString();
    const local = buf.readUInt32LE(at + 42), start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files[name] = buf.slice(start, start + size);
    eq(zlib.crc32(files[name]), crc, name + " is intact");
    at += 46 + nameLen;
  }
  return files;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  // A company profile and a deployment, as those tools save them, before the CAD first opens.
  await ctx.addInitScript(() => {
    if (localStorage.getItem("test-seeded")) return;
    localStorage.setItem("test-seeded", "1");
    localStorage.setItem("company-profile/v1", JSON.stringify({ companyName: "Test Medical Ltd", companyPhone: "0100 000" }));
    localStorage.setItem("deployment-maker/v1", JSON.stringify({ eventName: "Riverside Festival", venue: "Riverside Park",
      units: [{ callsign: "Alpha 1", ambulance: true, reg: "AB12 CDE", location: "Main stage",
        staff: [{ name: "Jo Bloggs", grade: "Paramedic" }] },
      { callsign: "Foot 1", ambulance: false, roaming: true, location: "", staff: [{ name: "Ali Khan", grade: "EMT" }] }] }));
  });
  // what3words, answered here: the test never goes out to the internet.
  const asked = [];
  await ctx.route("https://api.what3words.com/**", (route) => {
    asked.push(route.request().url());
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ suggestions: [{ words: "filled.count.soap", nearestPlace: "Bayswater, London", country: "GB" },
        { words: "filled.count.soak", nearestPlace: "Leeds", country: "GB" }] }) });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.clock.install({ time: new Date(2026, 6, 4, 12, 0, 0) });
  await page.goto(PAGE);
  const state = () => page.evaluate(() => CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1"))));
  const pdfText = async (dl) => fs.readFileSync(await dl.path(), "latin1");
  const later = (mmss) => page.clock.runFor(mmss);   // runs every timer on the way, as real time would

  /* ---- setup ---- */
  assert.match(await page.textContent("#companySummary"), /Test Medical Ltd/, "the saved company profile is used");
  assert.match(await page.textContent("#dmPick"), /Riverside Festival/);
  await page.click("#dmLoad");
  assert.match(await page.textContent("#dmResult"), /Loaded 2 units/);
  let cad = await state();
  assert.deepStrictEqual(cad.units.map((u) => [u.callsign, u.type, u.reg, u.staff[0].name]),
    [["Alpha 1", "Ambulance", "AB12 CDE", "Jo Bloggs"], ["Foot 1", "Other", "", "Ali Khan"]]);
  assert.deepStrictEqual(cad.places.map((p) => [p.name, p.kind]), [["Main stage", "standby"]], "a unit's location becomes a standby point");
  eq(cad.units[0].at, cad.places[0].id, "and the unit starts there");
  eq(cad.event.name, "Riverside Festival");
  await page.locator(".unit-row").nth(1).getByLabel("Type").selectOption("Foot team");
  await page.fill("#evStart", "2026-07-04T11:00");
  await page.fill("#evEnd", "2026-07-04T23:00");
  await page.fill("#evCrowd", "20000");
  for (const [name, kind] of [["Gate B", "poi"], ["Treatment centre", "tc"]]) {
    await page.click("#addPlace");
    await page.locator(".place-line").last().getByLabel("Location name").fill(name);
    await page.locator(".place-line").last().getByLabel("Kind of location").selectOption(kind);
  }
  await page.click("#addHospital");
  await page.getByLabel("Hospital name").fill("Royal Infirmary");
  await page.fill("#w3wKey", "TESTKEY");

  const [setupFile] = await Promise.all([page.waitForEvent("download"), page.click("#setupExport")]);
  const setup = JSON.parse(fs.readFileSync(await setupFile.path(), "utf8"));
  eq(setup.format, "event-cad/setup");
  eq(setup.units.length, 2);
  eq(setup.event.crowd, 20000);
  assert.ok(!JSON.stringify(setup).includes("TESTKEY"), "the what3words key is never exported");

  const [paper] = await Promise.all([page.waitForEvent("download"), page.click("#paperBtn")]);
  const paperText = await pdfText(paper);
  for (const s of ["UNIT STATUS SHEET", "Alpha 1", "Jo Bloggs, Paramedic", "CALL LIST", "CALL SHEET", "METHANE MESSAGE",
    "Royal Infirmary", "Gate B", "Falls", "Pre-alert \\(ATMIST\\)"]) {
    assert.ok(paperText.includes(s), "paper fallback pack missing " + s);
  }

  /* ---- a call from start to finish ---- */
  await page.click(".tab[data-tab=cad]");
  await page.fill("#controller", "Sam Lee");
  await page.press("#controller", "Tab");
  await page.click("#newCallBtn");
  const sheet = page.locator("#callSheet");
  eq(await sheet.locator("h2").textContent(), "Call 001");
  await sheet.getByLabel("How it came in").selectOption("Radio");
  await sheet.getByLabel("Reported by").fill("Steward at gate B");
  await sheet.getByLabel("Point of interest").selectOption({ label: "Gate B" });
  await sheet.getByLabel("what3words").pressSequentially("///filled.count.so");
  await sheet.getByRole("button", { name: "///filled.count.soap, near Bayswater, London" }).click();
  eq(await sheet.getByLabel("what3words").inputValue(), "///filled.count.soap");
  eq(await sheet.getByRole("link", { name: /Show/ }).getAttribute("href"), "https://what3words.com/filled.count.soap");
  assert.ok(asked.length && asked.every((u) => u.includes("key=TESTKEY")), "suggestions come from what3words with the key");
  await sheet.getByLabel("MPDS protocol").selectOption("17");
  await sheet.getByLabel("Category", { exact: true }).selectOption("2");
  await sheet.getByLabel("Police involved").check();
  await sheet.getByRole("button", { name: "+ Add patient" }).click();
  await sheet.locator(".patient-row").getByLabel("Age").fill("34");
  await sheet.locator(".patient-row").getByLabel("Sex").selectOption("Female");
  await sheet.locator(".patient-row").getByLabel("PRF number").fill("PRF-1001");

  await later("06:00");
  assert.match(await page.textContent("#alerts"), /Call 001 has no unit assigned \(6 min\)/);
  assert.match(await page.getAttribute("#callList .call-item", "class"), /overdue/);
  await sheet.getByLabel("Unit to assign").selectOption({ label: "Alpha 1: available" });
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  assert.doesNotMatch(await page.textContent("#alerts"), /no unit assigned/);
  await later("02:00");
  await sheet.getByRole("button", { name: "En route: Alpha 1" }).click();
  await later("04:00");
  await sheet.getByRole("button", { name: "On scene: Alpha 1" }).click();
  const alphaRow = page.locator("#boardBody tr", { hasText: "Alpha 1" });
  eq(await alphaRow.locator(".badge").textContent(), "On scene");
  assert.match(await alphaRow.textContent(), /Call 001: Gate B/);

  await later("21:00");
  assert.match(await page.textContent("#alerts"), /Alpha 1 on scene at call 001 with no update for 21 min/);
  await page.getByRole("button", { name: "Welfare check done: Alpha 1 OK" }).click();
  assert.doesNotMatch(await page.textContent("#alerts"), /welfare/);
  assert.match(await sheet.locator(".log-list").textContent(), /Welfare check: Alpha 1 OK/);

  await later("02:00");
  await sheet.getByRole("button", { name: "Moving patient: Alpha 1" }).click();
  await sheet.getByLabel("Moving patient to").selectOption("hospital");
  await sheet.getByLabel("Hospital", { exact: true }).fill("Royal Infirmary");
  await sheet.getByLabel("Blue light / pre-alert").check();
  const pre = sheet.locator(".prealert");
  await pre.getByLabel("Age").fill("34");
  await pre.getByLabel("Mechanism").fill("Fall from stage");
  await pre.getByLabel("ETA").fill("15 min");
  await pre.getByLabel("Passed to").fill("ED nurse in charge");
  await pre.getByLabel("Passed", { exact: true }).selectOption("nhs");
  await pre.getByLabel("NHS CAD number").fill("NHS-123");
  eq(await alphaRow.locator(".badge").textContent(), "Moving patient");
  assert.match(await alphaRow.textContent(), /Royal Infirmary \(blue light\)/);
  await later("15:00");
  await sheet.getByRole("button", { name: "At destination: Alpha 1" }).click();
  await later("25:00");
  await sheet.getByLabel("When clear or stood down, goes to").selectOption({ label: "Main stage (standby)" });
  await sheet.getByRole("button", { name: "Close call" }).click();
  assert.match(await sheet.locator(".error").textContent(), /Clear or stand down Alpha 1 first/, "units clear before a call closes");
  await sheet.getByRole("button", { name: "Clear: Alpha 1" }).click();
  await sheet.getByRole("button", { name: "Close call" }).click();
  assert.match(await sheet.locator(".error").textContent(), /Give each patient an outcome/);
  await sheet.locator(".patient-row").getByLabel("Outcome").selectOption("Conveyed to hospital");
  await sheet.getByRole("button", { name: "Close call" }).click();
  assert.match(await sheet.locator(".badge").first().textContent(), /Closed 13:15/);
  eq(await alphaRow.locator(".badge").textContent(), "Available");
  assert.match(await alphaRow.textContent(), /Main stage/);

  /* ---- a duplicate, and a call handed to an NHS ambulance ---- */
  await page.click("#newCallBtn");
  await sheet.getByLabel("Duplicate of").selectOption("1");
  await sheet.getByRole("button", { name: "Close call" }).click();
  assert.match(await sheet.locator(".badge").first().textContent(), /Closed/, "a duplicate closes without an outcome");

  await page.click("#newCallBtn");
  await sheet.getByLabel("MPDS protocol").selectOption("9");
  await sheet.getByLabel("Category", { exact: true }).selectOption("1");
  await sheet.getByRole("button", { name: "+ Add patient" }).click();
  await sheet.locator(".patient-row").getByLabel("Age").fill("60");
  await later("01:00");
  await sheet.getByLabel("Unit to assign").selectOption({ label: "Foot 1: available" });
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await later("03:00");
  await sheet.getByRole("button", { name: "On scene: Foot 1" }).click();
  await sheet.getByRole("button", { name: "NHS ambulance requested" }).click();
  await sheet.getByLabel("NHS CAD number").fill("NHS-999");
  await sheet.getByLabel("Category given").selectOption("2");
  await later("30:00");
  await sheet.getByRole("button", { name: "NHS crew arrived" }).click();
  await later("10:00");
  await sheet.getByRole("button", { name: "Handed over" }).click();
  await sheet.locator(".patient-row").getByLabel("Outcome").selectOption("Handed to NHS ambulance");
  await sheet.getByRole("button", { name: "Stood down: Foot 1" }).click();
  await sheet.getByRole("button", { name: "Close call" }).click();
  assert.match(await sheet.locator(".badge").first().textContent(), /Closed 13:59/);

  /* ---- breaks and unavailable ---- */
  await page.getByRole("button", { name: "Break for Alpha 1" }).click();
  await page.locator("#unitPanel").getByLabel("Length").selectOption("15");
  await page.getByRole("button", { name: "Start break" }).click();
  eq(await alphaRow.locator(".badge").textContent(), "On break");
  assert.match(await alphaRow.textContent(), /until 14:14 \(15 min left\)/);
  await later("16:00");
  eq(await alphaRow.locator(".badge").textContent(), "Break over");
  assert.match(await page.textContent("#alerts"), /Alpha 1’s break ended at 14:14/);
  await page.locator("#alerts").getByRole("button", { name: "Back from break" }).click();
  eq(await alphaRow.locator(".badge").textContent(), "Available");
  const footRow = page.locator("#boardBody tr", { hasText: "Foot 1" });
  await page.getByRole("button", { name: "Unavailable: Foot 1" }).click();
  await page.locator("#unitPanel").getByLabel("Reason").fill("Restocking");
  await page.getByRole("button", { name: "Mark unavailable" }).click();
  eq(await footRow.locator(".badge").textContent(), "Unavailable");
  assert.match(await footRow.textContent(), /Restocking/);
  await later("05:00");
  await page.getByRole("button", { name: "Available: Foot 1" }).click();
  eq(await footRow.locator(".badge").textContent(), "Available");

  /* ---- treatment centre, control log and METHANE ---- */
  assert.match(await page.textContent("#alerts"), /Treatment centre count due/, "an hour into the event");
  await page.click(".tab[data-tab=tc]");
  await page.fill("#tcCount", "12");
  await page.fill("#tcNotes", "Busy after the headliner");
  await page.click("#tcAdd");
  assert.match(await page.textContent("#tcBody"), /12/);
  eq(await page.isHidden("#tcDue"), true, "a count stops the reminder");
  await page.click(".tab[data-tab=log]");
  await page.fill("#logText", "Gates open");
  await page.press("#logText", "Enter");
  assert.match(await page.textContent("#controlLog"), /Controller on duty: Sam Lee/);
  assert.match(await page.textContent("#controlLog"), /Gates open/);
  await page.click(".tab[data-tab=cad]");
  await page.click("#methaneBtn");
  await page.fill("#mt-e", "North field, by the big wheel");
  await page.fill("#mt-n", "Five casualties, two serious");
  await page.fill("#mtPassed", "NHS ambulance control");
  await page.click("#methaneSave");
  assert.match(await page.textContent("#controlLog"), /METHANE message: major incident declared at North field/);
  const [methanePdf] = await Promise.all([page.waitForEvent("download"),
    page.locator("#methaneList").getByRole("button", { name: /METHANE message/ }).click()]);
  const methaneText = await pdfText(methanePdf);
  for (const s of ["METHANE MESSAGE", "North field, by the big wheel", "Five casualties, two serious", "NHS ambulance control"]) {
    assert.ok(methaneText.includes(s), "METHANE PDF missing " + s);
  }

  /* ---- search ---- */
  await page.click(".tab[data-tab=cad]");
  await page.fill("#search", "NHS-999");
  eq(await page.locator("#closedList .call-item").count(), 1);
  assert.match(await page.textContent("#closedList"), /003/);
  await page.fill("#search", "");

  /* ---- the figures and the report ---- */
  cad = await state();
  const stats = await page.evaluate((c) => CAD.stats(c), cad);
  eq(stats.calls, 2, "the duplicate is left out");
  eq(stats.duplicates, 1);
  eq(stats.patients, 2);
  eq(stats.toHospital, 2);
  eq(stats.ppr.toFixed(2), "0.10");
  const all = stats.response[0];
  assert.deepStrictEqual([all.callToScene.avg, all.callToScene.median, all.callToScene.max], [8, 8, 12],
    "received to on scene: 12 and 4 minutes");
  assert.deepStrictEqual([all.assignToScene.avg, all.assignToScene.max], [4.5, 6], "assigned to on scene: 6 and 3 minutes");
  eq(stats.nhs[0].wait, 30);
  const alpha = stats.units.find((u) => u.callsign === "Alpha 1");
  assert.deepStrictEqual([alpha.calls, alpha.committed, alpha.turnaround.avg, alpha.breaks, alpha.breakMins], [1, 69, 25, 1, 16]);
  eq(stats.units.find((u) => u.callsign === "Foot 1").unavailMins, 5);

  await page.click(".tab[data-tab=report]");
  assert.match(await page.textContent("#reportSummary"), /2 calls, 2 patients, 2 to hospital, 1 duplicate\. 0 still open/);
  const [report] = await Promise.all([page.waitForEvent("download"), page.click("#reportBtn")]);
  assert.match(report.suggestedFilename(), /^Event-report-Riverside-Festival-2026-07-04\.pdf$/);
  const reportText = await pdfText(report);
  for (const s of ["EVENT REPORT", "Test Medical Ltd", "Riverside Festival", "20,000", "0.10", "12 min", "4.5 min",
    "17  Falls", "Category 1", "Radio", "Police involved", "Conveyed to hospital", "Royal Infirmary", "NHS-123", "NHS-999",
    "average wait 30 min", "1 h 09 min", "25 min", "1 \\(16 min\\)", "Busy after the headliner", "Gates open",
    "North field, by the big wheel"]) {
    assert.ok(reportText.includes(s), "report missing " + s);
  }

  const [zipFile] = await Promise.all([page.waitForEvent("download"), page.click("#zipBtn")]);
  const files = unzip(fs.readFileSync(await zipFile.path()));
  assert.deepStrictEqual(Object.keys(files), ["Call-001.pdf", "Call-002.pdf", "Call-003.pdf", "METHANE-1.pdf"]);
  Object.values(files).forEach((f) => eq(f.slice(0, 5).toString(), "%PDF-"));
  const call1 = files["Call-001.pdf"].toString("latin1");
  for (const s of ["CALL 001", "Steward at gate B", "///filled.count.soap", "17 Falls", "PRF-1001", "Conveyed to hospital",
    "Royal Infirmary", "Fall from stage", "ED nurse in charge", "NHS ambulance", "NHS-123", "Welfare check: Alpha 1 OK",
    "12:06", "12:12", "13:15"]) {
    assert.ok(call1.includes(s), "call 001's log missing " + s);
  }
  assert.ok(files["Call-002.pdf"].toString("latin1").includes("Duplicate call"));

  /* ---- a call logged after the report still counts ---- */
  await page.click(".tab[data-tab=cad]");
  await page.click("#newCallBtn");

  /* ---- export, import and a new event ---- */
  await page.click(".tab[data-tab=report]");
  const [whole] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const fresh = await (await browser.newContext({ acceptDownloads: true })).newPage();
  fresh.on("pageerror", (e) => errors.push("fresh: " + e.message));
  fresh.on("dialog", (d) => d.accept());
  await fresh.goto(PAGE);
  await fresh.click(".tab[data-tab=report]");
  await fresh.setInputFiles("#importFile", await whole.path());
  await fresh.waitForSelector("#saveResult:not([hidden])");   // files are read in the background
  assert.match(await fresh.textContent("#saveResult"), /4 calls/);
  await fresh.click(".tab[data-tab=setup]");
  await fresh.setInputFiles("#setupFile", await setupFile.path());
  await fresh.waitForSelector("#setupResult:not([hidden])");
  assert.match(await fresh.textContent("#setupResult"), /Calls have been logged/, "a setup never replaces one with calls");
  await fresh.click(".tab[data-tab=report]");
  await fresh.click("#newEventBtn");
  const after = await fresh.evaluate(() => CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1"))));
  eq(after.calls.length, 0);
  eq(after.units.length, 2, "a new event keeps the staffing");
  eq(after.units[0].history.length, 0);

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
