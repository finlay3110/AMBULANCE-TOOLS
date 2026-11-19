/*
 * Builds the Event CAD user guide as a PDF, with screenshots taken from the real app.
 *
 *   node event-cad/docs/build-guide.js
 *
 * Needs playwright, and python3 with pypdfium2 for the sample-PDF figures.
 * Screenshots land in docs/build/ (git-ignored), so the guide is always
 * regenerated from the current app rather than kept as stale images.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BUILD = path.join(__dirname, "build");
const SHOTS = path.join(BUILD, "shots");
const APP = "file://" + path.join(ROOT, "index.html");
const OUT = path.join(ROOT, "Event-CAD-User-Guide.pdf");
const RENDER = path.join(ROOT, "..", "bag-tracker", "docs", "render-pages.py");

// A made-up event: every name here is invented.
const d = (t) => "2027-07-17T" + t;
const EXAMPLE = {
  company: { companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890", cqcRegistered: true, cqcNumber: "1-234567890" },
  event: { name: "Riverside Summer Festival", venue: "Riverside Park", start: d("11:00"), end: d("23:00"),
    lead: "J. Smith, medical manager", control: "01234 567891, radio channel 2", crowd: 25000 },
  settings: { unassignedMins: 5, onSceneMins: 20, targets: { 1: 8, 2: 15, 3: 30 }, mapGrid: { cols: 8, rows: 5 } },
  controller: "Chris Lee", seq: 8,
  units: [
    { id: "u1", callsign: "Alpha 1", type: "Ambulance", reg: "AB12 CDE", at: "p1",
      staff: [{ name: "Sam Patel", grade: "Paramedic" }, { name: "Jo Bloggs", grade: "EMT" }] },
    { id: "u2", callsign: "Alpha 2", type: "Ambulance", reg: "XY67 ZAB", at: "p2",
      staff: [{ name: "Priya Shah", grade: "Paramedic" }, { name: "Tom Evans", grade: "Emergency care assistant" }] },
    { id: "u3", callsign: "Romeo 1", type: "Response car", at: "p3", staff: [{ name: "Kate Hill", grade: "Paramedic" }],
      history: [{ kind: "break", start: d("16:15"), until: d("16:45") }] },
    { id: "u4", callsign: "Foot 1", type: "Foot team", at: "p4", staff: [{ name: "Ali Khan", grade: "FREC 4" }],
      history: [{ kind: "unavailable", start: d("16:30"), reason: "Restocking" }] },
    { id: "u5", callsign: "Foot 2", type: "Foot team", at: "p1", staff: [{ name: "Ben Ford", grade: "EMT" }] },
    { id: "u6", callsign: "Cycle 1", type: "Cycle team", at: "p2", staff: [{ name: "Raj Dev", grade: "Paramedic" }] }],
  places: [{ id: "p1", name: "Main stage", kind: "standby", grid: "D2", w3w: "filled.count.soap" }, { id: "p2", name: "North gate", kind: "standby" },
    { id: "p3", name: "Main treatment centre", kind: "tc" }, { id: "p4", name: "Campsite C", kind: "standby" },
    { id: "p5", name: "Gate B", kind: "poi" }, { id: "p6", name: "Bar 2", kind: "poi" }, { id: "p7", name: "North TC", kind: "tc" }],
  hospitals: ["Royal Infirmary", "St Mary's Hospital"],
  hospitalStatus: { "St Mary's Hospital": { status: "pressure", note: "Long handover delays", since: d("15:40") } },
  calls: [
    { id: 1, received: d("12:04"), controller: "Chris Lee", source: "Radio", reportedBy: "Steward at gate B", place: "p5",
      locText: "By the info tent", grid: "B2", protocol: 17, category: 3, details: "Female tripped on a tent peg, painful left ankle.",
      patients: [{ age: "34", sex: "Female", prf: "PRF-1001", outcome: "Treated and discharged on scene", type: "Minor injury" }],
      units: [{ unit: "u4", assigned: d("12:05"), enroute: d("12:05"), onscene: d("12:09"), clear: d("12:31") }], closed: d("12:31") },
    { id: 2, received: d("14:02"), controller: "Chris Lee", source: "Radio", reportedBy: "Foot 2", place: "p1",
      locText: "Front of house, barrier 3", w3w: "filled.count.soap", grid: "D4", protocol: 10, category: 2,
      details: "Male 58, central chest pain radiating to the left arm, sweaty.",
      patients: [{ age: "58", sex: "Male", prf: "PRF-1002", outcome: "Conveyed to hospital", type: "Cardiac / chest pain" }],
      units: [{ unit: "u1", assigned: d("14:03"), enroute: d("14:03"), onscene: d("14:09"), moving: d("14:30"), dest: "hospital",
        hospital: "Royal Infirmary", blue: true, atmist: { a: "58", t: "Onset 13:50", m: "Chest pain at rest", i: "Nil",
          s: "HR 110, BP 150/90, SpO2 95%, ECG ST elevation V2-V4", tx: "Aspirin 300 mg, GTN" },
        eta: "15:00", passedTo: "ED nurse in charge", via: "nhs", nhsCad: "NHS-24871", atdest: d("14:52"), clear: d("15:20") }],
      log: [{ time: d("14:12"), text: "12-lead shows STEMI, pre-alert to follow", by: "Chris Lee" }], closed: d("15:20") },
    { id: 3, received: d("16:05"), controller: "Chris Lee", source: "Radio", reportedBy: "Security, campsite C", place: "p4",
      locText: "Blue tent, row 12", grid: "F4", protocol: 31, category: 1, details: "Male found unresponsive by friends.",
      patients: [{ age: "24", sex: "Male", prf: "PRF-1003", type: "Intoxication", alcohol: true }],
      units: [{ unit: "u6", assigned: d("16:06"), onscene: d("16:09"), clear: d("16:35") },
        { unit: "u2", assigned: d("16:06"), enroute: d("16:06"), onscene: d("16:11"), moving: d("16:30"), dest: "hospital",
          hospital: "Royal Infirmary", blue: true, atmist: { a: "24", t: "Found 16:00", m: "Suspected overdose", i: "Nil obvious",
            s: "GCS 8, RR 8, SpO2 88% on air", tx: "Naloxone, airway adjunct, oxygen" }, eta: "16:55",
          passedTo: "Resus coordinator", via: "hospital" }],
      nhs: { requested: d("16:08"), cad: "NHS-25110", category: 1 },
      log: [{ time: d("16:12"), text: "Crew with patient, airway managed", by: "Chris Lee" }] },
    { id: 4, received: d("16:20"), controller: "Chris Lee", source: "Steward/Security", reportedBy: "Steward 14", place: "p5",
      locText: "Lost child, aged 7, at the info tent", grid: "B2", category: 3, flags: { vulnerable: true, safeguarding: true },
      units: [{ unit: "u5", assigned: d("16:22"), enroute: d("16:22"), onscene: d("16:27") }] },
    { id: 5, received: d("16:33"), controller: "Chris Lee", source: "Radio", reportedBy: "Steward at bar 2", place: "p6",
      grid: "E3", protocol: 4, category: 3, details: "Male with a facial injury after an argument.", flags: { police: true },
      policeRef: "Police log 0412" }],
  tc: [{ time: d("15:00"), place: "p3", count: 8, by: "Chris Lee" }, { time: d("15:00"), place: "p7", count: 3, by: "Chris Lee" },
    { time: d("16:00"), place: "p3", count: 6, notes: "Heat related", by: "Chris Lee" }],
  conditions: [{ time: d("14:00"), crowd: 21000, temp: "26", weather: "Sunny", by: "Chris Lee" },
    { time: d("15:00"), crowd: 23500, temp: "28", weather: "Hot", by: "Chris Lee" },
    { time: d("16:00"), crowd: 24200, temp: "27", weather: "Hot", by: "Chris Lee" }],
  persons: [{ id: 1, time: d("16:20"), desc: "Girl aged 7, red coat, blonde hair", lastSeen: "Main stage bar, 16:05",
    reportedBy: "Mother, at the info tent", by: "Chris Lee" }],
  log: [{ time: d("11:00"), text: "Controller on duty: Chris Lee", by: "Chris Lee" },
    { time: d("11:30"), text: "Gates open", by: "Chris Lee" },
    { time: d("15:40"), text: "Hospital status: St Mary's Hospital under pressure (Long handover delays)", by: "Chris Lee" }]
};

async function shot(target, name) {
  await target.screenshot({ path: path.join(SHOTS, name + ".png") });
  console.log("  " + name + ".png");
}

/* The top of a tall element only, so the figure stays big enough to read. */
async function topShot(page, target, name, maxH) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox(), scrolled = await page.evaluate(() => window.scrollY);
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true,
    clip: { x: box.x, y: box.y + scrolled, width: box.width, height: Math.min(box.height, maxH) } });
  console.log("  " + name + ".png");
}

async function capture(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: "en-GB" });
  page.on("dialog", (dlg) => dlg.accept());
  await page.clock.install({ time: new Date("2027-07-17T16:40:00") });
  await page.goto(APP);
  // A simple drawn site map, so the guide can show where the map appears.
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem("event-cad/v1", JSON.stringify(data));
    const c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = 1200; c.height = 750;
    g.fillStyle = "#dcecd6"; g.fillRect(0, 0, 1200, 750);
    g.strokeStyle = "#7f927f"; g.font = "22px sans-serif"; g.fillStyle = "#3c3c3c";
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
      g.strokeRect(i * 150, j * 150, 150, 150);
      g.fillText("ABCDEFGH"[i] + (j + 1), i * 150 + 8, j * 150 + 26);
    }
    [["MAIN STAGE", 450, 150, "#5a5a8c"], ["MAIN TC", 120, 480, "#c83c3c"], ["NORTH TC", 930, 90, "#c83c3c"],
      ["CAMPSITE C", 830, 470, "#d9b44a"]].forEach(([t, x, y, col]) => {
      g.fillStyle = col; g.fillRect(x, y, 220, 120); g.fillStyle = "#fff"; g.fillText(t, x + 20, y + 68);
    });
    localStorage.setItem("event-cad/site-map", JSON.stringify({ src: c.toDataURL("image/jpeg", 0.85), w: 1200, h: 750 }));
  }, EXAMPLE);
  await page.reload();
  // Whole-page figures: the bar that stays on screen and the call sheet's own scrolling would cut them short.
  await page.addStyleTag({ content: ".cad-actions, .call-col { position: static !important; max-height: none !important; overflow: visible !important; }" });
  await page.clock.runFor(5000);
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());

  await page.click('[data-tab="setup"]');
  const setupCard = (title) => page.locator("#panel-setup .card", { has: page.locator("h2", { hasText: title }) });
  await shot(setupCard("Event"), "setup-event");
  await topShot(page, setupCard("Staffing"), "setup-staffing", 700);
  await shot(setupCard("Locations"), "setup-locations");
  await shot(setupCard("Alerts, targets"), "setup-alerts");

  await page.click('[data-tab="cad"]');
  await page.locator("#callList .call-item", { hasText: "003" }).click();
  await blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "cad-screen");
  await shot(page.locator(".cad-layout .card").first(), "board");
  await shot(page.locator("#hospitalCard"), "hospitals");
  const section = (title) => page.locator("#callSheet .call-section", { has: page.locator("h3", { hasText: title }) });
  await topShot(page, page.locator("#callSheet"), "call-sheet", 1000);
  await topShot(page, page.locator("#callSheet .assignment").nth(1), "call-units", 620);
  await shot(section("Call log"), "call-log");
  await page.getByRole("button", { name: "Break for Alpha 1" }).click();
  await shot(page.locator("#unitPanel"), "break-form");
  await page.locator("#unitPanel").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Crew change: Alpha 1" }).click();
  await page.locator("#unitPanel").getByLabel("Going off: Jo Bloggs, EMT").check();
  await page.locator("#unitPanel").getByLabel("Coming on: name 1").fill("Kim Lowe");
  await page.locator("#unitPanel").getByLabel("Clinical grade 1").fill("EMT");
  await shot(page.locator("#unitPanel"), "crew-form");
  await page.locator("#unitPanel").getByRole("button", { name: "Cancel" }).click();
  await page.click("#sitrepBtn");
  await shot(page.locator("#sitrepPanel"), "sitrep");
  await page.click("#sitrepClose");
  await shot(page.locator("#summaryStrip"), "summary");

  await page.click('[data-tab="tc"]');
  await shot(page.locator("#panel-tc .card").first(), "tc");
  await page.click('[data-tab="log"]');
  await shot(page.locator("#conditionsCard"), "conditions");
  await shot(page.locator("#personsCard"), "persons");
  await page.fill("#cas-p1", "2"); await page.fill("#cas-p2", "3"); await page.fill("#cas-p3", "9"); await page.fill("#cas-dead", "0");
  await page.click("#casAdd");
  await page.locator("#casResult").evaluate((e) => { e.hidden = true; });
  await shot(page.locator("#casualtyCard"), "casualties");
  await page.click("#methaneNew");
  await page.fill("#mt-e", "North field, by the big wheel");
  await page.fill("#mt-t", "Partial collapse of a temporary stand");
  await blur();
  await shot(page.locator("#methaneCard"), "methane");
  await page.click("#methaneCancel");

  await page.click('[data-tab="report"]');
  await shot(page.locator("#panel-report .card").nth(0), "report-card");
  await shot(page.locator("#panel-report .card").nth(1), "backup-card");

  const cad = await page.evaluate(() => CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1"))));
  const save = async (expr, name) => {
    const uri = await page.evaluate(expr);
    const file = path.join(BUILD, name);
    fs.writeFileSync(file, Buffer.from(uri.split(",")[1], "base64"));
    return file;
  };
  // The maps with their pictures, as the CAD hands them to its PDFs.
  await page.evaluate(() => {
    window.guideMaps = () => {
      const c = CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1")));
      const raw = JSON.parse(localStorage.getItem("event-cad/site-map")), imgs = raw.images || { m1: raw };
      return c.settings.maps.filter((m) => imgs[m.id]).map((m) => Object.assign({}, m, imgs[m.id]));
    };
  });
  const files = {
    report: await save(() => CadPDF.report(CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1"))),
      guideMaps()).output("datauristring"),
      "sample-report.pdf"),
    call: await save(() => { const c = CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1")));
      return CadPDF.call(c, CAD.callById(c, 2)).output("datauristring"); }, "sample-call.pdf"),
    paper: await save(() => CadPDF.paper(CAD.clean(JSON.parse(localStorage.getItem("event-cad/v1"))),
      guideMaps()).output("datauristring"), "sample-paper.pdf")
  };
  await page.close();
  return { files, calls: cad.calls.length };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // UK date and time order in the boxes comes from the browser's language setting.
  const browser = await chromium.launch(Object.assign(
    { env: Object.assign({}, process.env, { LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" }) },
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));

  console.log("Capturing the app:");
  const { files } = await capture(browser);

  console.log("Rendering sample PDF pages:");
  try {
    execFileSync("python3", [RENDER, SHOTS, files.report, "0", "pdf-report", files.report, "-1", "pdf-report-map", files.call, "0", "pdf-call",
      files.paper, "0", "pdf-paper-units", files.paper, "2", "pdf-paper-call"], { stdio: "inherit" });
  } catch (e) {
    console.warn("\n! Sample PDF pages were skipped: python3 with pypdfium2 is needed for those figures.\n");
  }

  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "user-guide.html"), { waitUntil: "networkidle" });
  await page.pdf({
    path: OUT, format: "A4", printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font:9px -apple-system,Segoe UI,Roboto,sans-serif;' +
      'color:#7b8794;padding:0 14mm;display:flex;justify-content:space-between;">' +
      "<span>Event CAD &mdash; user guide</span>" +
      '<span class="pageNumber"></span></div>'
  });
  await browser.close();
  console.log("\nWrote " + path.relative(path.join(ROOT, ".."), OUT));
})();
