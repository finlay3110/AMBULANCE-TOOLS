/* Smoke test: drives index.html in headless Chromium. Run with `npm test`. */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("file://" + path.join(__dirname, "..", "index.html"));

  // Theme: auto, then light, then dark, and the choice is kept.
  const eq = (a, b, m) => assert.strictEqual(a, b, m);
  eq(await page.textContent("#themeBtn"), "Theme: auto");
  await page.click("#themeBtn");
  eq(await page.getAttribute("html", "data-theme"), "light");
  await page.click("#themeBtn");
  eq(await page.getAttribute("html", "data-theme"), "dark");
  assert.ok(await page.evaluate(() => {
    const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return rgb[0] + rgb[1] + rgb[2] < 200;
  }), "dark should repaint the page");
  await page.reload();
  eq(await page.textContent("#themeBtn"), "Theme: dark", "the choice survives a reload");
  await page.click("#themeBtn");
  eq(await page.getAttribute("html", "data-theme"), null, "back to auto");

  // Generating with nothing filled in is refused with reasons.
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /company name.*bag name.*at least one item/);
  // So is saving it to a file, and the empty starred fields turn red.
  let downloads = 0;
  const counting = () => downloads++;
  page.on("download", counting);
  await page.click("#exportBtn");
  await page.waitForTimeout(300);
  eq(downloads, 0, "an unfinished bag is not saved to a file");
  page.off("download", counting);
  assert.match(await page.textContent("#importResult"), /starred fields.*company name.*bag name/);
  eq(await page.getAttribute("#companyName", "aria-invalid"), "true");
  eq(await page.getAttribute("#bagName", "aria-invalid"), "true");

  await page.click(".tab[data-tab=setup]");
  await page.fill("#companyName", "Test Medical Ltd");
  eq(await page.getAttribute("#companyName", "aria-invalid"), null, "the red goes once it is filled in");
  // CQC: a ticked box needs a number before anything generates.
  assert.ok(await page.locator("#f-cqcNumber").isHidden());
  await page.check("#cqcRegistered");
  await page.fill("#bagName", "Primary response bag");
  await page.fill("#bagNumber", "RB-03");

  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /CQC registration number/);
  await page.click(".tab[data-tab=setup]");
  await page.fill("#cqcNumber", "1-555000111");

  // Two pouches; Enter in the add-item row adds the item.
  await page.click(".tab[data-tab=pouches]");
  for (const [pouch, items] of [
    ["Airway pouch", [["OPA size 2", 1], ["OPA size 3", 1], ["NPA 6.0", 2]]],
    ["Trauma pouch", [["Crepe bandage 7.5cm", 4], ["Trauma dressing", 2]]]
  ]) {
    await page.fill("#pouchName", pouch);
    await page.press("#pouchName", "Enter");
    for (const [name, min] of items) {
      const row = page.locator(".add-item").last();
      await row.locator("input").nth(1).fill(String(min));
      await row.locator("input").first().fill(name);
      await row.locator("input").first().press("Enter");
    }
  }
  assert.strictEqual(await page.textContent("#pouchCount"), "2");

  // Editing a min qty in place; a negative or junk value is not stored.
  const minInput = page.locator(".pouch").nth(1).locator(".item-row:not(.item-cols):not(.add-item) input[type=number]").first();
  await minInput.fill("6");
  // Sealed pouch: number box only shows once ticked.
  const airway = page.locator(".pouch").first();
  assert.ok(await airway.locator("input[aria-label='Seal number']").isHidden());
  await airway.getByLabel("Sealed with a tag").check();
  await airway.locator("input[aria-label='Seal number']").fill("T12345");

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bag-tracker/v1")));
  assert.strictEqual(stored.pouches[1].items[0].min, 6);
  assert.deepStrictEqual(stored.pouches.map((p) => p.items.length), [3, 2]);
  assert.deepStrictEqual(stored.pouches.map((p) => [p.sealed, p.seal]), [[true, "T12345"], [false, ""]]);

  // Move the trauma pouch up.
  await page.locator(".pouch").nth(1).getByRole("button", { name: "Move pouch up" }).click();
  assert.strictEqual(await page.locator(".pouch-name").first().inputValue(), "Trauma pouch");

  // Survives a reload.
  await page.reload();
  assert.strictEqual(await page.inputValue("#bagNumber"), "RB-03");
  assert.strictEqual(await page.locator(".pouch").count(), 2);

  // Changing the pouches dated the layout today.
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  assert.strictEqual(await page.inputValue("#updated"), today);
  await page.fill("#version", "3");

  // Builds the PDF from what is stored, after `change` edits a copy of it.
  const pdf = (change) => page.evaluate((src) => {
    const bag = JSON.parse(localStorage.getItem("bag-tracker/v1"));
    if (src) new Function("bag", src)(bag);
    const doc = window.BagPDF.build(bag);
    const n = doc.internal.getNumberOfPages();
    const sizes = [];
    for (let i = 1; i <= n; i++) { doc.setPage(i); sizes.push(Math.round(doc.internal.pageSize.getWidth())); }
    return { n, sizes, raw: doc.output() };
  }, change || "");

  // Default: labels, kit list, checklist, landscape log.
  const info = await pdf();
  assert.deepStrictEqual(info.sizes, [210, 210, 210, 297]);
  for (const s of ["IF FOUND,", "BAG KIT LIST", "BAG KIT CHECKLIST", "SIGN IN / SIGN OUT LOG", "TRAUMA POUCH", "OPA size 2",
    "Crepe bandage 7.5cm", "SEAL No. T12345", "CQC 1-555000111", "Seal no. found", "Kit list v3, updated " + today.split("-").reverse().join("/")]) {
    assert.ok(info.raw.includes(s), "PDF missing " + s);
  }

  // Sheet choice and checklist copies; settings are stored.
  await page.click(".tab[data-tab=generate]");
  await page.uncheck("#printLabel");
  await page.uncheck("#printLog");
  await page.fill("#printCopies", "3");
  const picked = await pdf();
  assert.strictEqual(picked.n, 4, "kit list + 3 checklists");
  assert.ok(!picked.raw.includes("IF FOUND,") && !picked.raw.includes("SIGN IN / SIGN OUT LOG"));
  await page.uncheck("#printKit");
  await page.uncheck("#printCheck");
  await page.click("#generateBtn");
  assert.match(await page.textContent("#genError"), /at least one sheet/);
  for (const id of ["#printLabel", "#printKit", "#printCheck", "#printLog"]) await page.check(id);
  await page.fill("#printCopies", "1");

  // Several bag numbers: a full set each, and no single bag's seal numbers.
  const multi = await pdf('bag.bagNumber = "RB-01, RB-02,RB-03"');
  assert.strictEqual(multi.n, 12);
  assert.ok(!multi.raw.includes("T12345"), "seal no. must not be copied to every bag");
  for (const n of ["RB-01", "RB-02", "RB-03"]) assert.ok(multi.raw.includes("Bag " + n + "  "), "footer missing " + n);

  // A long bag spills onto more pages without throwing.
  const long = await page.evaluate(() => {
    const bag = JSON.parse(localStorage.getItem("bag-tracker/v1"));
    for (let p = 0; p < 6; p++) bag.pouches.push({ name: "Pouch " + p, items: Array.from({ length: 15 }, (_, i) => ({ name: "Item " + i, min: i })) });
    return window.BagPDF.build(bag).internal.getNumberOfPages();
  });
  assert.ok(long > 5, "long bag should paginate, got " + long);

  // Import rejects a file that is not a bag.
  await page.setInputFiles("#importFile", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"a\":1}") });
  await page.waitForSelector("#importResult:not([hidden])");
  assert.match(await page.textContent("#importResult"), /not a bag/);
  assert.strictEqual(await page.locator(".pouch").count(), 2);

  // Export -> clear -> import round trip.
  await page.click(".tab[data-tab=generate]");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const file = await dl.path();
  await page.click("#resetAll");
  assert.strictEqual(await page.locator(".pouch").count(), 0);
  await page.setInputFiles("#importFile", file);
  await page.waitForFunction(() => document.querySelectorAll(".pouch").length === 2);
  assert.strictEqual(await page.inputValue("#companyName"), "Test Medical Ltd");

  // QR stickers: scanning one opens a check of this bag on another phone.
  await page.click(".tab[data-tab=generate]");
  const [stickers] = await Promise.all([page.waitForEvent("download"), page.click("#stickerBtn")]);
  assert.match(stickers.suggestedFilename(), /^QR-stickers-/);
  const sheet = require("fs").readFileSync(await stickers.path(), "latin1");
  eq(await page.isVisible("#checkShareBtn"), false, "no Share button where the browser can't share files");
  await page.check("#largeStickers");
  const [big] = await Promise.all([page.waitForEvent("download"), page.click("#stickerBtn")]);
  const bigSheet = require("fs").readFileSync(await big.path(), "latin1");
  assert.ok(bigSheet.includes("PRINTED BY"), "large stickers keep the write-in boxes");
  assert.match(await page.textContent("#stickerResult"), /four stickers/);
  await page.uncheck("#largeStickers");
  for (const s of ["PRINTED BY", "DATE"]) assert.ok(sheet.includes(s), "sticker missing " + s);
  assert.ok(!sheet.includes("EXPIRY"), "no expiry line on the sticker");
  const link = await page.evaluate(() => window.BagTrackerLink("RB-03"));
  assert.ok(/#v=[jz][A-Za-z0-9_-]+$/.test(link), "the bag travels after the #");
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
  await phone.waitForFunction(() => document.getElementById("scanResult").textContent.includes("Ready to check RB-03"));
  assert.ok(await phone.locator("#panel-check.active").isVisible(), "it opens on the check");
  const state = (item) => phone.locator(".count-row", { hasText: item }).locator(".count-state").textContent();
  await phone.getByLabel("Found: OPA size 2").fill("1");
  eq(await state("OPA size 2"), "All there");
  await phone.getByLabel("Found: NPA 6.0").fill("1");
  eq(await state("NPA 6.0"), "Short", "under the minimum of 2");
  await phone.getByLabel("Note: NPA 6.0").fill("One used, reorder");
  await phone.getByLabel("All there: Crepe bandage 7.5cm").click();
  eq(await state("Crepe bandage 7.5cm"), "All there", "the tick fills in the minimum");
  await phone.getByLabel("Seal found: Airway pouch").fill("T12345");
  await phone.getByRole("group", { name: "Seal intact: Airway pouch" }).getByRole("button", { name: "Intact" }).click();
  await phone.getByLabel("New seal: Airway pouch").fill("T22222");
  await phone.click("#allThere");
  eq(await phone.textContent("#checkSummary"), "4 all there  \u00b7  1 short  \u00b7  0 not counted");
  await phone.fill("#bagSealFound", "B100");
  // Both of the crew check the bag at the start of the shift, and each signs.
  const sign = async (n) => {
    const pad = phone.locator(".checker").nth(n).locator("canvas");
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    await phone.mouse.move(box.x + 20, box.y + 50);
    await phone.mouse.down();
    for (let i = 1; i <= 10; i++) await phone.mouse.move(box.x + 20 + i * 25, box.y + 50 + (i % 2 ? -20 : 20));
    await phone.mouse.up();
  };
  const person = (n) => phone.locator(".checker").nth(n).locator("input");
  await person(0).nth(0).fill("Sam Patel");
  await person(0).nth(1).fill("Paramedic");
  await sign(0);
  await phone.click("#addChecker");
  await person(1).nth(0).fill("Alex Jones");
  await person(1).nth(1).fill("ECA");
  await sign(1);
  eq(await phone.locator(".checker .sig-done").filter({ hasText: /^Signed at \d\d:\d\d$/ }).count(), 2);
  const checked = await phone.evaluate(() => {
    const doc = window.BagPDF.buildCheck(JSON.parse(localStorage.getItem("bag-tracker/v1")));
    return doc.output();
  });
  for (const s of ["BAG KIT CHECKLIST", "RB-03", "SHORT", "One used, reorder", "T12345", "T22222", "B100",
    "Sam Patel", "Paramedic", "Alex Jones", "ECA", "CHECKED BY"]) {
    assert.ok(checked.includes(s), "completed check missing " + s);
  }
  assert.ok(checked.includes("/Subtype /Image"), "the signature is on the check");
  const [checkPdf] = await Promise.all([phone.waitForEvent("download"), phone.click("#checkPdfBtn")]);
  assert.match(checkPdf.suggestedFilename(), /^Bag-check-RB-03-\d{4}-\d{2}-\d{2}\.pdf$/);
  await phone.click("#checkShareBtn");
  const shared = await phone.waitForFunction(() => window.__shared).then((h) => h.jsonValue());
  assert.match(shared.name, /^Bag-check-RB-03-\d{4}-\d{2}-\d{2}\.pdf$/);
  eq(shared.type, "application/pdf");
  assert.ok(shared.size > 5000, "the shared file is the check PDF");
  // Scanning again the same day carries on with that check.
  await phone.goto(link);
  await phone.waitForFunction(() => document.getElementById("scanResult").textContent.includes("Carrying on"));
  eq(await phone.inputValue("[aria-label='Found: NPA 6.0']"), "1");
  // A new check clears the counts but keeps the bag.
  await phone.click("#newCheckBtn");
  eq(await phone.inputValue("[aria-label='Found: NPA 6.0']"), "");
  eq(await phone.textContent("#checkSummary"), "0 all there  \u00b7  0 short  \u00b7  5 not counted");
  eq(await phone.locator(".checker").count(), 1, "a new check starts with one empty person");
  eq(await person(0).nth(0).inputValue(), "");
  // A check saved before checks took a crew keeps its one signer.
  await phone.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("bag-tracker/v1"));
    delete d.check.crew;
    Object.assign(d.check, { by: "Old Signer", grade: "Technician", signedAt: "08:15" });
    localStorage.setItem("bag-tracker/v1", JSON.stringify(d));
  });
  await phone.reload();
  await phone.click("[data-tab=check]");
  eq(await person(0).nth(0).inputValue(), "Old Signer");
  eq(await person(0).nth(1).inputValue(), "Technician");

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
