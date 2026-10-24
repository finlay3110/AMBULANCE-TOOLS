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

  // Generating with nothing filled in is refused with reasons.
  await page.click("#generateTop");
  assert.match(await page.textContent("#genError"), /company name.*bag name.*at least one item/);

  await page.click(".tab[data-tab=setup]");
  await page.fill("#companyName", "Test Medical Ltd");
  await page.fill("#bagName", "Primary response bag");
  await page.fill("#bagNumber", "RB-03");

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
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bag-tracker/v1")));
  assert.strictEqual(stored.pouches[1].items[0].min, 6);
  assert.deepStrictEqual(stored.pouches.map((p) => p.items.length), [3, 2]);

  // Move the trauma pouch up.
  await page.locator(".pouch").nth(1).getByRole("button", { name: "Move pouch up" }).click();
  assert.strictEqual(await page.locator(".pouch-name").first().inputValue(), "Trauma pouch");

  // Survives a reload.
  await page.reload();
  assert.strictEqual(await page.inputValue("#bagNumber"), "RB-03");
  assert.strictEqual(await page.locator(".pouch").count(), 2);

  // PDF: kit list, checklist, landscape log — 3 pages with this little content.
  const info = await page.evaluate(() => {
    const doc = window.BagPDF.build(JSON.parse(localStorage.getItem("bag-tracker/v1")));
    const n = doc.internal.getNumberOfPages();
    const sizes = [];
    for (let i = 1; i <= n; i++) { doc.setPage(i); sizes.push(Math.round(doc.internal.pageSize.getWidth())); }
    return { n, sizes, raw: doc.output() };
  });
  assert.strictEqual(info.n, 3);
  assert.deepStrictEqual(info.sizes, [210, 210, 297]);
  for (const s of ["BAG KIT LIST", "BAG KIT CHECKLIST", "SIGN IN / SIGN OUT LOG", "TRAUMA POUCH", "OPA size 2", "Crepe bandage 7.5cm"]) {
    assert.ok(info.raw.includes(s), "PDF missing " + s);
  }

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

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
