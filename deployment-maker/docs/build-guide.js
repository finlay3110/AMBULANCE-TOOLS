/*
 * Builds the user guide as a PDF, with screenshots taken from the real app.
 *
 *   node docs/build-guide.js
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
const OUT = path.join(ROOT, "Deployment-Maker-User-Guide.pdf");
// The Bag Tracker's helper turns sample PDF pages into pictures.
const RENDER = path.join(ROOT, "..", "bag-tracker", "docs", "render-pages.py");

const person = (name, grade, radio, manager) =>
  ({ name, grade, radio, manager: !!manager, signedIn: "", breakStart: "", breakEnd: "", stoodDown: "" });
const unit = (callsign, o, staff) => Object.assign({ callsign, ambulance: false, reg: "", roaming: false,
  location: "", hasKitBag: true, kitBag: "", hasDrugBag: true, drugBag: "", staff }, o);

// A made-up event: every name here is invented.
const EXAMPLE = {
  eventName: "Riverside Summer Festival", venue: "Riverside Park, Townsville", eventDate: "2027-07-17",
  madeBy: "J. Smith, Medical Lead", radioList: true,
  company: { companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890", companyAddress: "",
    cqcRegistered: true, cqcNumber: "1-234567890" },
  units: [
    unit("Silver", { location: "Event Control", hasKitBag: false, hasDrugBag: false },
      [person("Chris Lee", "Paramedic", "R1", true)]),
    unit("Alpha 1", { ambulance: true, reg: "AB12 CDE", location: "Main Stage", kitBag: "KB-01", drugBag: "DB-01" },
      [person("Sam Patel", "Paramedic", "R4"), person("Jo Bloggs", "EMT", "R5")]),
    unit("Alpha 2", { ambulance: true, reg: "XY67 ZAB", roaming: true },
      [person("Priya Shah", "Paramedic", "R6"), person("Tom Evans", "Emergency care assistant", "R7")]),
    unit("Foot 1", { roaming: true, kitBag: "KB-03", hasDrugBag: false },
      [person("Ali Khan", "FREC 4", "R8"), person("", "First responder", "")])
  ]
};

async function shot(target, name) {
  await target.screenshot({ path: path.join(SHOTS, name + ".png") });
  console.log("  " + name + ".png");
}

async function capture(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2, locale: "en-GB" });
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? d.defaultValue() : undefined));
  await page.goto(APP);
  await page.evaluate((d) => { localStorage.clear(); localStorage.setItem("deployment-maker/v1", JSON.stringify(d)); },
    EXAMPLE);
  await page.reload();
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());

  await shot(page.locator(".topbar"), "topbar");
  // A plan saved on this device, so the list shows one.
  await page.click('[data-tab="generate"]');
  await page.click("#planBtn");
  await page.click('[data-tab="setup"]');
  await shot(page.locator("#panel-setup .card").nth(0), "plans");
  await shot(page.locator("#panel-setup .card").nth(1), "company");
  await shot(page.locator("#panel-setup .card").nth(2), "event");

  await page.click('[data-tab="units"]');
  await shot(page.locator("#panel-units .card").first(), "add-unit");
  await shot(page.locator(".unit").nth(1), "unit-card");

  // On the day, part way through.
  const at = (t) => page.clock.setFixedTime(new Date("2027-07-17T" + t + ":00"));
  await page.click('[data-tab="day"]');
  const press = (name, label) => page.locator(".day-row", { hasText: name }).getByRole("button", { name: label }).click();
  await at("08:45"); await press("Chris Lee", "Sign in");
  await at("08:52"); await press("Sam Patel", "Sign in");
  await at("08:55"); await press("Jo Bloggs", "Sign in");
  await at("12:30"); await press("Sam Patel", "Start break");
  await at("13:00"); await press("Sam Patel", "End break");
  await at("13:05"); await press("Jo Bloggs", "Start break");
  await at("09:01"); await press("Priya Shah", "Sign in");
  await blur();
  await shot(page.locator("#panel-day .card").first(), "day-summary");
  await shot(page.locator(".day-unit").nth(1), "day-unit");

  await page.click('[data-tab="generate"]');
  await shot(page.locator("#panel-generate .card").nth(0), "generate");
  await shot(page.locator("#panel-generate .card").nth(1), "save");

  const samplePdf = path.join(BUILD, "sample-deployment.pdf");
  const uri = await page.evaluate(() =>
    window.DeploymentPDF.build(JSON.parse(localStorage.getItem("deployment-maker/v1"))).output("datauristring"));
  fs.writeFileSync(samplePdf, Buffer.from(uri.split(",")[1], "base64"));
  const stored = await page.evaluate(() => localStorage.getItem("deployment-maker/v1"));
  await page.close();

  const phone = await browser.newPage({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 3, isMobile: true, locale: "en-GB" });
  await phone.goto(APP);
  await phone.evaluate((d) => localStorage.setItem("deployment-maker/v1", d), stored);
  await phone.reload();
  await phone.click('[data-tab="day"]');
  await phone.evaluate(() => window.scrollTo(0, 420));
  await shot(phone, "phone");
  await phone.close();
  return samplePdf;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // UK date and time order in the boxes comes from the browser's language setting.
  const browser = await chromium.launch(Object.assign(
    { env: Object.assign({}, process.env, { LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" }) },
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));

  console.log("Capturing the app:");
  const samplePdf = await capture(browser);

  console.log("Rendering sample PDF pages:");
  try {
    execFileSync("python3", [RENDER, SHOTS, samplePdf, "0", "pdf-log", samplePdf, "-1", "pdf-radio"],
      { stdio: "inherit" });
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
      "<span>Deployment Maker &mdash; user guide</span>" +
      '<span class="pageNumber"></span></div>'
  });
  await browser.close();
  console.log("\nWrote " + path.relative(ROOT, OUT));
})();
