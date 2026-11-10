/*
 * Builds the user guide as a PDF, with screenshots taken from the real app.
 *
 *   npm run guide
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
const OUT = path.join(ROOT, "Bag-Tracker-User-Guide.pdf");

/* A small logo so the figures show the branding feature working. */
function sampleLogo() {
  const file = path.join(BUILD, "sample-logo.png");
  fs.writeFileSync(file, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAPAAAABQCAIAAACoK28rAAAAzUlEQVR42u3UwQnAIBBFQZXcTEWmJC3H" +
    "ltJRCrABBW+BZKaBhc9jY64lwFckEyBoEDQIGgSNoEHQIGgQNAgaQYOgQdAgaBA0ggZBg6BB0LBymGDf" +
    "0++3Tp/tsr8PjaBB0CBoEDQIGkGDoEHQIGgQNIIGQYOgQdAgaAQNggZBg6BB0AgaBA2CBkGDoBE0CBoE" +
    "DYJG0CBoEDQIGgSNoEHQIGgQNAiaf4m5FivgQ4OgQdAgaAQNggZBg6BB0AgaBA2CBkGDoBE0CBoEDYKG" +
    "qQFVpwUBmo9fcgAAAABJRU5ErkJggg==", "base64"));
  return file;
}

async function shot(target, name) {
  await target.screenshot({ path: path.join(SHOTS, name + ".png") });
  console.log("  " + name + ".png");
}

const POUCHES = [
  ["Airway pouch", "T004871", [["OPA size 1", 1], ["OPA size 2", 1], ["OPA size 3", 1],
    ["NPA 6.0", 1], ["NPA 7.0", 1], ["Water-based lubricant sachet", 2]]],
  ["Trauma pouch", "", [["Crepe bandage 7.5cm", 4], ["Trauma dressing (large)", 2],
    ["Tourniquet", 1], ["Triangular bandage", 2], ["Haemostatic gauze", 1]]],
  ["Main compartment", null, [["Tough cut shears", 1], ["Foil blanket", 2], ["Gloves (pairs, M)", 10]]]
];

async function capture(browser) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2, locale: "en-GB" });
  page.on("dialog", (d) => d.accept());
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ---- setup ----
  // Company details from a saved Company Profile, the way most people will fill them in.
  await page.evaluate(() => localStorage.setItem("company-profile/v1", JSON.stringify({
    companyName: "Northern Event Medical Ltd", companyPhone: "01234 567890",
    companyAddress: "Unit 4, Example Way\nTownsville, AB1 2CD", cqcRegistered: true, cqcNumber: "1-234567890" })));
  await page.reload();
  await page.click("#companyUseBtn");
  await page.setInputFiles("#logoFile", sampleLogo());
  await page.waitForFunction(() => !document.getElementById("logoPreview").hidden);
  await page.fill("#bagName", "Primary response bag");
  await page.fill("#bagNumber", "RB-03");
  await page.fill("#location", "Vehicle 2");
  await page.fill("#sealNumber", "004512");
  await page.fill("#packedBy", "J. Smith");
  await page.fill("#packedDate", "2026-11-04");
  await page.fill("#version", "3");
  await blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page.locator(".topbar"), "topbar");
  await shot(page.locator("#panel-setup .card").nth(1), "company-card");

  // ---- pouches, added through the app's own forms ----
  await page.click('[data-tab="pouches"]');
  await page.fill("#pouchName", "Airway pouch");
  await shot(page.locator("#panel-pouches .card").first(), "add-pouch");
  await page.fill("#pouchName", "");
  for (const [name, seal, items] of POUCHES) {
    await page.fill("#pouchName", name);
    await page.press("#pouchName", "Enter");
    const card = page.locator(".pouch").last();
    if (seal !== null) {
      await card.getByLabel("Sealed with a tag").check();
      if (seal) await card.locator("input[aria-label='Seal number']").fill(seal);
    }
    for (const [item, min] of items) {
      const row = card.locator(".add-item");
      await row.locator("input").nth(1).fill(String(min));
      await row.locator("input").first().fill(item);
      await row.locator("input").first().press("Enter");
    }
  }
  await blur();
  await shot(page.locator(".pouch").first(), "pouch-card");

  // Updated date is set by the pouch edits above, so the bag details shot comes after them.
  await page.click('[data-tab="setup"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page.locator("#panel-setup .card").nth(2), "bag-details");

  // ---- generate ----
  await page.click('[data-tab="generate"]');
  await shot(page.locator("#panel-generate .card").first(), "generate");
  await page.uncheck("#printLabel"); await page.uncheck("#printKit");
  await page.uncheck("#printCheck"); await page.uncheck("#printLog");
  await page.click("#generateBtn");
  await shot(page.locator("#panel-generate .card").first(), "generate-error");
  for (const id of ["#printLabel", "#printKit", "#printCheck", "#printLog"]) await page.check(id);

  const samplePdf = path.join(BUILD, "sample-bag.pdf");
  const uri = await page.evaluate(() =>
    window.BagPDF.build(JSON.parse(localStorage.getItem("bag-tracker/v1"))).output("datauristring"));
  fs.writeFileSync(samplePdf, Buffer.from(uri.split(",")[1], "base64"));
  const stored = await page.evaluate(() => localStorage.getItem("bag-tracker/v1"));
  await page.close();

  // ---- phone: same bag, in a separate browser context ----
  const phone = await browser.newPage({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 3, isMobile: true, locale: "en-GB" });
  await phone.goto(APP);
  await phone.evaluate((bag) => localStorage.setItem("bag-tracker/v1", bag), stored);
  await phone.reload();
  await phone.click('[data-tab="pouches"]');
  await phone.evaluate(() => window.scrollTo(0, 300));
  await shot(phone, "phone");
  await phone.close();
  return samplePdf;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // UK date order in the date boxes comes from the browser's language setting, not the page's.
  const browser = await chromium.launch(Object.assign(
    { env: Object.assign({}, process.env, { LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" }) },
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));

  console.log("Capturing the app:");
  const samplePdf = await capture(browser);

  console.log("Rendering sample PDF pages:");
  try {
    execFileSync("python3", [path.join(__dirname, "render-pages.py"), SHOTS,
      samplePdf, "0", "pdf-labels", samplePdf, "1", "pdf-kit-list",
      samplePdf, "2", "pdf-checklist", samplePdf, "3", "pdf-log"], { stdio: "inherit" });
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
      "<span>Bag Tracker &mdash; user guide</span>" +
      '<span class="pageNumber"></span></div>'
  });
  await browser.close();
  console.log("\nWrote " + path.relative(ROOT, OUT));
})();
