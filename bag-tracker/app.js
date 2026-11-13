/* UI state and wiring. Everything is kept in localStorage on this device. */
(function () {
  "use strict";
  var todayIso = window.Shared.today, nowTime = window.Shared.nowTime, savedProfile = window.Shared.savedCompany;

  var KEY = "bag-tracker/v1";
  var FIELDS = ["companyName", "companyPhone", "companyAddress", "cqcNumber",
    "bagName", "bagNumber", "location", "sealNumber", "packedBy", "packedDate", "version", "updated"];
  var PRINT = { printKit: "kitList", printCheck: "checklist", printLog: "log", printLabel: "label" };
  var LOGO_MAX_EDGE = 480;      // px, plenty for print at the size it is drawn
  var LOGO_MAX_BYTES = 400000;  // keep localStorage well inside its quota
  var $ = function (id) { return document.getElementById(id); };

  function blank() {
    return { pouches: [], print: { kitList: true, checklist: true, copies: 1, log: true, label: true } };
  }
  var bag = blank();

  /* ---------------- storage ---------------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(bag)); return true; } catch (e) { return false; }
  }

  /* Accepts anything JSON.parse returned; keeps only what the app understands. */
  function clean(raw) {
    var out = blank();
    if (!raw || typeof raw !== "object") return out;
    FIELDS.forEach(function (f) { if (typeof raw[f] === "string") out[f] = raw[f]; });
    out.cqcRegistered = raw.cqcRegistered === true;
    if (typeof raw.logo === "string" && raw.logo.indexOf("data:image/") === 0) {
      out.logo = raw.logo; out.logoW = +raw.logoW || 0; out.logoH = +raw.logoH || 0;
    }
    var pr = raw.print && typeof raw.print === "object" ? raw.print : {};
    Object.keys(PRINT).forEach(function (id) {
      if (typeof pr[PRINT[id]] === "boolean") out.print[PRINT[id]] = pr[PRINT[id]];
    });
    out.print.copies = copiesOf(pr.copies);
    out.check = cleanCheck(raw.check);
    (Array.isArray(raw.pouches) ? raw.pouches : []).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      out.pouches.push({
        name: String(p.name || ""),
        sealed: p.sealed === true,
        seal: String(p.seal || ""),
        items: (Array.isArray(p.items) ? p.items : []).filter(Boolean).map(function (it) {
          return { name: String(it.name || ""), min: minOf(it.min) };
        })
      });
    });
    return out;
  }

  /* An on-screen check: counts as whole numbers, a PNG signature, nothing else. */
  function cleanCheck(c) {
    if (!c || typeof c !== "object") return null;
    var s = function (v) { return typeof v === "string" ? v : ""; };
    var out = { date: s(c.date), time: s(c.time), bagSealFound: s(c.bagSealFound), bagNewSeal: s(c.bagNewSeal),
      results: {}, seals: {}, crew: [] };
    Object.keys(c.results && typeof c.results === "object" ? c.results : {}).forEach(function (k) {
      var r = c.results[k] || {};
      out.results[k] = { found: /^\d{1,4}$/.test(r.found) ? r.found : "", note: s(r.note) };
    });
    Object.keys(c.seals && typeof c.seals === "object" ? c.seals : {}).forEach(function (k) {
      var x = c.seals[k] || {};
      out.seals[k] = { found: s(x.found), intact: x.intact === "yes" || x.intact === "no" ? x.intact : "", newSeal: s(x.newSeal) };
    });
    function sig(g) {
      return g && typeof g.src === "string" && g.src.indexOf("data:image/png;base64,") === 0 && +g.w > 0 && +g.h > 0
        ? { src: g.src, w: +g.w, h: +g.h } : null;
    }
    // A check saved with one signer (before checks took a crew) becomes the first person.
    var crew = Array.isArray(c.crew) ? c.crew : (c.by || c.sig ? [{ name: c.by, grade: c.grade, sig: c.sig, signedAt: c.signedAt }] : []);
    out.crew = crew.filter(function (m) { return m && typeof m === "object"; }).map(function (m) {
      return { name: s(m.name), grade: s(m.grade), sig: sig(m.sig), signedAt: /^([01]\d|2[0-3]):[0-5]\d$/.test(m.signedAt) ? m.signedAt : "" };
    });
    if (!out.crew.length) out.crew.push({ name: "", grade: "", sig: null, signedAt: "" });
    return out;
  }

  function minOf(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n >= 0 ? Math.min(n, 9999) : 1;
  }

  function copiesOf(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n >= 1 ? Math.min(n, 50) : 1;
  }

  function load() {
    try { bag = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { bag = blank(); }
  }

  /* ---------------- setup fields ---------------- */
  function fillSetup() {
    FIELDS.forEach(function (f) { $(f).value = bag[f] || ""; });
    Object.keys(PRINT).forEach(function (id) { $(id).checked = bag.print[PRINT[id]]; });
    $("printCopies").value = bag.print.copies;
    $("cqcRegistered").checked = !!bag.cqcRegistered;
    $("f-cqcNumber").hidden = !bag.cqcRegistered;
    showLogo();
  }

  FIELDS.forEach(function (f) {
    $(f).addEventListener("input", function () {
      bag[f] = $(f).value;
      save();
      if ($(f).value.trim()) $(f).removeAttribute("aria-invalid");
    });
  });

  $("cqcRegistered").addEventListener("change", function () {
    bag.cqcRegistered = this.checked;
    $("f-cqcNumber").hidden = !this.checked;
    if (this.checked) $("cqcNumber").focus();
    save();
  });

  Object.keys(PRINT).forEach(function (id) {
    $(id).addEventListener("change", function () { bag.print[PRINT[id]] = $(id).checked; save(); });
  });
  $("printCopies").addEventListener("input", function () { bag.print.copies = copiesOf(this.value); save(); });
  $("printCopies").addEventListener("change", function () { this.value = bag.print.copies; });

  /* Any change to the pouches dates the layout, so printed copies show which version they are. */
  function layoutChanged() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    bag.updated = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    $("updated").value = bag.updated;
    save();
  }

  function showLogo() {
    $("logoPreview").hidden = !bag.logo;
    $("logoRemove").hidden = !bag.logo;
    if (bag.logo) $("logoImg").src = bag.logo;
    $("logoBtn").textContent = bag.logo ? "Replace image…" : "Choose image…";
  }

  function logoMessage(kind, text) {
    $("logoHint").className = "echo" + (kind ? " " + kind : "");
    $("logoHint").textContent = text;
  }

  /* Scale down before storing: a phone photo would blow the storage quota. */
  function readLogo(file) {
    var reader = new FileReader();
    reader.onerror = function () { logoMessage("bad", "That image could not be read."); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { logoMessage("bad", "That file could not be read as an image."); };
      img.onload = function () {
        var scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        var data = canvas.toDataURL("image/png");
        if (data.length > LOGO_MAX_BYTES) data = canvas.toDataURL("image/jpeg", 0.85);
        if (data.length > LOGO_MAX_BYTES) {
          logoMessage("bad", "That image is too large to store. Try a smaller one.");
          return;
        }
        bag.logo = data; bag.logoW = w; bag.logoH = h;
        showLogo();
        var ok = save();
        logoMessage(ok ? "good" : "bad", ok
          ? "Logo set." : "Logo set, but this browser would not store it — export the .json to keep it.");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  $("logoBtn").addEventListener("click", function () { $("logoFile").click(); });
  $("logoFile").addEventListener("change", function () {
    if (this.files[0]) readLogo(this.files[0]);
    this.value = "";
  });
  $("logoRemove").addEventListener("click", function () {
    delete bag.logo; delete bag.logoW; delete bag.logoH;
    save(); showLogo(); logoMessage("", "PNG or JPEG, printed at the top of each sheet.");
  });

  /* ---------------- pouches ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(text, cls, label, fn) {
    var b = el("button", "icon-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    if (label) b.setAttribute("aria-label", label);
    b.addEventListener("click", fn);
    return b;
  }

  function move(list, i, delta) {
    var j = i + delta;
    if (j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
    changed();
  }

  function changed() { layoutChanged(); renderPouches(); }

  /* Text inputs update state in place and do not re-render, so typing keeps focus. */
  function boundInput(obj, key, attrs) {
    var input = el("input");
    Object.keys(attrs).forEach(function (a) { input.setAttribute(a, attrs[a]); });
    input.value = obj[key];
    input.addEventListener("input", function () {
      obj[key] = key === "min" ? minOf(input.value) : input.value;
      layoutChanged();
    });
    if (key === "min") input.addEventListener("change", function () { input.value = obj.min; });
    return input;
  }

  function renderPouches() {
    var list = $("pouchList");
    list.innerHTML = "";
    $("pouchCount").textContent = bag.pouches.length;
    $("pouchEmpty").hidden = bag.pouches.length > 0;

    bag.pouches.forEach(function (p, pi) {
      var card = el("div", "card pouch");
      var head = el("div", "pouch-head");
      head.appendChild(boundInput(p, "name", { type: "text", "aria-label": "Pouch name", class: "pouch-name" }));
      var btns = el("div", "med-btns");
      btns.appendChild(button("↑", "", "Move pouch up", function () { move(bag.pouches, pi, -1); }));
      btns.appendChild(button("↓", "", "Move pouch down", function () { move(bag.pouches, pi, 1); }));
      btns.appendChild(button("Remove", "del", "Remove pouch", function () {
        if (p.items.length && !confirm("Remove “" + p.name + "” and its " + p.items.length + " items?")) return;
        bag.pouches.splice(pi, 1);
        changed();
      }));
      head.appendChild(btns);
      card.appendChild(head);

      // Sealed with a numbered tag: the number changes each reseal, so it is optional.
      var sealRow = el("div", "seal-row");
      var tick = el("label", "check-row");
      var box = el("input");
      box.type = "checkbox";
      box.checked = p.sealed;
      tick.appendChild(box);
      tick.appendChild(el("span", "", "Sealed with a tag"));
      var seal = boundInput(p, "seal", { type: "text", placeholder: "Seal no. (optional)", "aria-label": "Seal number" });
      seal.hidden = !p.sealed;
      box.addEventListener("change", function () {
        p.sealed = box.checked;
        seal.hidden = !p.sealed;
        layoutChanged();
      });
      sealRow.appendChild(tick);
      sealRow.appendChild(seal);
      card.appendChild(sealRow);

      if (p.items.length) {
        var cols = el("div", "item-row item-cols");
        cols.appendChild(el("span", "", "Item"));
        cols.appendChild(el("span", "", "Min qty"));
        cols.appendChild(el("span"));   // keeps the headings over their columns
        card.appendChild(cols);
      }
      p.items.forEach(function (it, ii) {
        var row = el("div", "item-row");
        row.appendChild(boundInput(it, "name", { type: "text", "aria-label": "Item name" }));
        row.appendChild(boundInput(it, "min", { type: "number", min: "0", step: "1", "aria-label": "Minimum quantity" }));
        var b = el("div", "med-btns");
        b.appendChild(button("↑", "", "Move item up", function () { move(p.items, ii, -1); }));
        b.appendChild(button("↓", "", "Move item down", function () { move(p.items, ii, 1); }));
        b.appendChild(button("×", "del", "Remove item", function () { p.items.splice(ii, 1); changed(); }));
        row.appendChild(b);
        card.appendChild(row);
      });

      // Add-item row: Enter in either box adds, and focus returns to the name.
      var form = el("form", "item-row add-item");
      var name = el("input");
      name.placeholder = "Add item, e.g. Crepe bandage 7.5cm";
      name.setAttribute("aria-label", "New item name");
      var min = el("input");
      min.type = "number"; min.min = "0"; min.step = "1"; min.value = "1";
      min.setAttribute("aria-label", "New item minimum quantity");
      var add = el("button", "btn primary small", "Add");
      add.type = "submit";
      form.appendChild(name); form.appendChild(min); form.appendChild(add);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!name.value.trim()) { name.focus(); return; }
        p.items.push({ name: name.value.trim(), min: minOf(min.value) });
        changed();
        list.querySelectorAll(".add-item input")[pi * 2].focus();
      });
      card.appendChild(form);
      list.appendChild(card);
    });
  }

  $("pouchForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("pouchName").value.trim();
    if (!name) return;
    bag.pouches.push({ name: name, sealed: false, seal: "", items: [] });
    $("pouchName").value = "";
    changed();
    var inputs = document.querySelectorAll(".add-item input");
    inputs[inputs.length - 2].focus();
  });

  /* ---------------- tabs ---------------- */
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    if (name === "check") renderCheck();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.goto); });
  });

  /* ---------------- generate ---------------- */
  /* The starred fields, needed before the bag is printed or saved to a file.
     Any left empty turn red until they are filled in. */
  function missingRequired() {
    var out = [];
    [["companyName", "the company name"], ["cqcNumber", "the CQC registration number", !bag.cqcRegistered],
     ["bagName", "the bag name"]].forEach(function (f) {
      var empty = !f[2] && !(bag[f[0]] || "").trim();
      if (empty) { out.push(f[1]); $(f[0]).setAttribute("aria-invalid", "true"); }
      else $(f[0]).removeAttribute("aria-invalid");
    });
    return out;
  }

  function problems() {
    var out = missingRequired().map(function (m) { return "Enter " + m + " (Setup)."; });
    if (!bag.pouches.some(function (p) { return p.items.length; })) out.push("Add at least one item to a pouch.");
    if (!Object.keys(PRINT).some(function (id) { return bag.print[PRINT[id]]; })) out.push("Tick at least one sheet to print.");
    bag.pouches.forEach(function (p, i) {
      if (!p.name.trim()) out.push("Pouch " + (i + 1) + " has no name.");
      if (p.items.some(function (it) { return !it.name.trim(); })) out.push("“" + p.name + "” has an item with no name.");
    });
    return out;
  }

  function fileName() {
    var base = (bag.bagNumber || bag.bagName || "bag").trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
    return "bag-" + (base || "bag");
  }

  function build() {
    var errs = problems();
    $("genError").hidden = !errs.length;
    $("genError").textContent = errs.join(" ");
    if (errs.length) { showTab("generate"); return null; }
    return window.BagPDF.build(bag);
  }

  function download() {
    var pdf = build();
    if (pdf) pdf.save(fileName() + ".pdf");
  }
  $("generateBtn").addEventListener("click", download);
  $("generateTop").addEventListener("click", download);
  $("previewBtn").addEventListener("click", function () {
    var pdf = build();
    if (pdf) window.open(pdf.output("bloburl"), "_blank");
  });

  /* ---------------- export / import ---------------- */
  $("exportBtn").addEventListener("click", function () {
    var missing = missingRequired();
    if (missing.length) {
      importMessage("bad", "Fill in the starred fields before saving the bag to a file: " + missing.join(", ") +
        " (Setup). Your work so far is still kept in this browser.");
      return;
    }
    $("importResult").hidden = true;
    var blob = new Blob([JSON.stringify(bag, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a");
    a.href = url;
    a.download = fileName() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  function importMessage(kind, text) {
    $("importResult").hidden = false;
    $("importResult").className = "notice " + kind;
    $("importResult").textContent = text;
  }

  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importSetupBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      if (!parsed || !Array.isArray(parsed.pouches)) {
        showTab("generate");
        importMessage("bad", "“" + file.name + "” is not a bag exported from this tool.");
        return;
      }
      bag = clean(parsed);
      save(); fillSetup(); renderPouches();
      showTab("pouches");
      importMessage("good", "Loaded “" + file.name + "”.");
    };
    reader.readAsText(file);
  });

  /* Company details only, from the Company Profile saved on this device, a
     company file, a Drug Bag Tracker or Deployment Maker export, or another
     bag. Pouches and bag details are left alone. */

  function companyMessage(kind, text) {
    $("companyResult").hidden = false;
    $("companyResult").className = "notice " + kind;
    $("companyResult").textContent = text;
  }

  function useCompany(src, verb) {
    ["companyName", "companyPhone", "companyAddress", "cqcNumber"].forEach(function (f) {
      if (typeof src[f] === "string") bag[f] = src[f];
    });
    bag.cqcRegistered = src.cqcRegistered;
    if (src.logo) { bag.logo = src.logo; bag.logoW = src.logoW; bag.logoH = src.logoH; }
    save(); fillSetup();
    companyMessage("good", verb + " company details for " + (bag.companyName || "this organisation") +
      (src.logo ? ", including the logo." : "."));
  }

  function showProfileButton() {
    var p = savedProfile();
    $("companyUseBtn").hidden = !p;
    if (p) $("companyUseBtn").textContent = "Use saved company profile (" + p.companyName.trim() + ")";
  }
  // A profile saved in another tab shows up here without a reload.
  window.addEventListener("storage", showProfileButton);

  $("companyUseBtn").addEventListener("click", function () {
    var p = savedProfile();
    if (p) useCompany(p, "Using");
  });

  $("companyImportBtn").addEventListener("click", function () { $("companyFile").click(); });
  $("companyFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { companyMessage("bad", "That file could not be read."); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      var src = window.Shared.company(parsed);
      if (!src) {
        companyMessage("bad", "\u201c" + file.name + "\u201d does not contain company details. Nothing has been changed.");
        return;
      }
      useCompany(src, "Loaded");
    };
    reader.readAsText(file);
  });

  /* ---------------- on-screen check ---------------- */
  function newCheck() {
    return { date: todayIso(), time: nowTime(), bagSealFound: "", bagNewSeal: "", results: {}, seals: {},
      crew: [{ name: "", grade: "", sig: null, signedAt: "" }] };
  }
  function result(p, it) {
    var key = window.BagPDF.resultKey(p, it);
    if (!bag.check.results[key]) bag.check.results[key] = { found: "", note: "" };
    return bag.check.results[key];
  }
  function stateOf(found, min) { return found === "" ? "" : Number(found) >= min ? "ok" : "short"; }

  function checkSummary() {
    var ok = 0, short = 0, todo = 0;
    bag.pouches.forEach(function (p) {
      p.items.forEach(function (it) {
        var r = bag.check.results[window.BagPDF.resultKey(p, it)], st = r ? stateOf(r.found, it.min) : "";
        if (st === "ok") ok++; else if (st === "short") short++; else todo++;
      });
    });
    $("checkSummary").textContent = ok + " all there  ·  " + short + " short  ·  " + todo + " not counted";
  }

  function renderCheck() {
    if (!bag.check) bag.check = newCheck();
    var c = bag.check;
    [["bagSealFound", "bagSealFound"], ["bagNewSeal", "bagNewSeal"]]
      .forEach(function (f) { $(f[0]).value = c[f[1]]; });
    var list = $("checkList");
    list.innerHTML = "";
    if (!bag.pouches.length) list.appendChild(el("p", "empty", "This bag has no pouches yet. Add them on the Pouches tab."));
    bag.pouches.forEach(function (p) {
      var card = el("div", "card");
      card.appendChild(el("h2", "", p.name));
      if (p.sealed) {
        if (!c.seals[p.name]) c.seals[p.name] = { found: "", intact: "", newSeal: "" };
        var s = c.seals[p.name], row = el("div", "seal-check");
        [["found", "Seal found"], ["newSeal", "New seal"]].forEach(function (f, i) {
          var label = el("label", "field");
          label.appendChild(el("span", "", f[1]));
          var input = el("input");
          input.type = "text";
          input.value = s[f[0]];
          input.setAttribute("aria-label", f[1] + ": " + p.name);
          input.addEventListener("input", function () { s[f[0]] = input.value; save(); });
          label.appendChild(input);
          if (i === 0) row.appendChild(label);
          else {
            var intact = el("div", "intact");
            intact.setAttribute("role", "group");
            intact.setAttribute("aria-label", "Seal intact: " + p.name);
            [["yes", "Intact"], ["no", "Broken"]].forEach(function (o) {
              var b = el("button", o[0], o[1]);
              b.type = "button";
              b.setAttribute("aria-pressed", s.intact === o[0]);
              b.addEventListener("click", function () {
                s.intact = s.intact === o[0] ? "" : o[0];
                save();
                intact.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x.className === s.intact); });
              });
              intact.appendChild(b);
            });
            row.appendChild(intact);
            row.appendChild(label);
          }
        });
        card.appendChild(row);
      }
      p.items.forEach(function (it) {
        var r = result(p, it), row = el("div", "count-row");
        var name = el("div", "item-name", it.name);
        name.appendChild(el("span", "min", "minimum " + it.min));
        row.appendChild(name);
        var found = el("input");
        found.type = "number";
        found.min = "0";
        found.inputMode = "numeric";
        found.value = r.found;
        found.setAttribute("aria-label", "Found: " + it.name);
        var tick = el("button", "btn ghost small", "✓");
        tick.type = "button";
        tick.setAttribute("aria-label", "All there: " + it.name);
        var state = el("span", "count-state");
        function show() {
          var st = stateOf(r.found, it.min);
          state.className = "count-state " + st;
          state.textContent = st === "ok" ? "All there" : st === "short" ? "Short" : "";
          checkSummary();
        }
        found.addEventListener("input", function () {
          r.found = found.value === "" ? "" : String(Math.max(0, Math.floor(Number(found.value)) || 0));
          save();
          show();
        });
        tick.addEventListener("click", function () { r.found = String(it.min); found.value = r.found; save(); show(); });
        var note = el("input", "note");
        note.type = "text";
        note.value = r.note;
        note.placeholder = "Note (optional): replaced, out of date…";
        note.setAttribute("aria-label", "Note: " + it.name);
        note.addEventListener("input", function () { r.note = note.value; save(); });
        row.appendChild(found);
        row.appendChild(tick);
        row.appendChild(state);
        row.appendChild(note);
        card.appendChild(row);
        show();
      });
      list.appendChild(card);
    });
    renderSig();
    checkSummary();
    save();
  }

  [["bagSealFound", "bagSealFound"], ["bagNewSeal", "bagNewSeal"]]
    .forEach(function (f) { $(f[0]).addEventListener("input", function () { bag.check[f[1]] = this.value; save(); }); });

  /* Everyone who checked the bag (say both of a crew): name, clinical grade, signature and when they signed. */
  function renderSig() {
    var box = $("checkCrew");
    box.innerHTML = "";
    bag.check.crew.forEach(function (m, mi) {
      var row = el("div", "checker");
      [["name", "Name", ""], ["grade", "Clinical grade", "grades"]].forEach(function (f) {
        var label = el("label", "field");
        label.appendChild(el("span", "", f[1]));
        var input = el("input");
        input.type = "text";
        input.value = m[f[0]];
        if (f[2]) input.setAttribute("list", f[2]);
        input.addEventListener("input", function () { m[f[0]] = input.value; save(); });
        label.appendChild(input);
        row.appendChild(label);
      });
      var area = el("div", "sig-area");
      if (m.sig) {
        var img = el("img", "sig-pad");
        img.src = m.sig.src;
        img.alt = "Signature of " + (m.name || "checker");
        area.appendChild(img);
        area.appendChild(el("span", "sig-done", "Signed at " + m.signedAt));
        var again = el("button", "btn ghost small", "Sign again");
        again.type = "button";
        again.addEventListener("click", function () { m.sig = null; m.signedAt = ""; save(); renderSig(); });
        area.appendChild(again);
      } else {
        var when = el("span", "sig-done");
        area.appendChild(window.Shared.signaturePad(function (sig) {
          m.sig = sig;
          if (!m.signedAt) m.signedAt = nowTime();
          save();
          when.textContent = "Signed at " + m.signedAt;
        }));
        area.appendChild(when);
      }
      if (bag.check.crew.length > 1) {
        var remove = el("button", "btn ghost small", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + (m.name || "person " + (mi + 1)));
        remove.addEventListener("click", function () { bag.check.crew.splice(mi, 1); save(); renderSig(); });
        area.appendChild(remove);
      }
      row.appendChild(area);
      box.appendChild(row);
    });
  }

  $("addChecker").addEventListener("click", function () {
    bag.check.crew.push({ name: "", grade: "", sig: null, signedAt: "" });
    save();
    renderSig();
    var rows = $("checkCrew").querySelectorAll(".checker");
    rows[rows.length - 1].querySelector("input").focus();
  });

  $("allThere").addEventListener("click", function () {
    bag.pouches.forEach(function (p) {
      p.items.forEach(function (it) { var r = result(p, it); if (r.found === "") r.found = String(it.min); });
    });
    save();
    renderCheck();
  });

  function checkFile() { return "Bag-check-" + fileName().replace(/^bag-/, "") + "-" + bag.check.date + ".pdf"; }
  $("checkPdfBtn").addEventListener("click", function () {
    if (!bag.pouches.length) return;
    window.BagPDF.buildCheck(bag).save(checkFile());
  });
  $("checkShareBtn").hidden = !window.Shared.canSharePdf();
  $("checkShareBtn").addEventListener("click", function () {
    if (bag.pouches.length) window.Shared.sharePdf(window.BagPDF.buildCheck(bag), checkFile());
  });

  $("newCheckBtn").addEventListener("click", function () {
    if (!confirm("Start a new check? The counts, seals, notes and signature are cleared. Download this check first " +
      "if you want it.")) return;
    bag.check = newCheck();
    save();
    renderCheck();
  });

  /* ---------------- QR stickers ---------------- */
  function bagNumbers() {
    var list = (bag.bagNumber || "").split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return list.length ? list : [""];
  }

  var LONG_LINK = 1500;   // characters; past this the code is too dense to scan on a small sticker

  /* A link that carries this bag's layout, for one bag number. */
  function bagLink(number) {
    return window.Shared.link({
      bagName: (bag.bagName || "").trim(), bagNumber: number, location: (bag.location || "").trim(),
      pouches: bag.pouches.map(function (p) {
        return [p.name, p.sealed ? 1 : 0, p.items.map(function (it) { return [it.name, it.min]; })];
      })
    });
  }
  window.BagTrackerLink = bagLink;   // for the tests

  $("stickerBtn").addEventListener("click", function () {
    if (!(bag.bagName || "").trim() || !bag.pouches.length) {
      $("stickerResult").className = "notice bad";
      $("stickerResult").textContent = "Enter the bag name and add its pouches first.";
      $("stickerResult").hidden = false;
      return;
    }
    var numbers = bagNumbers();
    Promise.all(numbers.map(bagLink)).then(function (urls) {
      // A long kit list makes a dense code that only scans when printed large.
      var long = urls.some(function (u) { return u.length > LONG_LINK; });
      if (long) $("largeStickers").checked = true;
      var large = $("largeStickers").checked;
      try {
        window.BagPDF.stickers(bag, numbers.map(function (n, i) { return { number: n, url: urls[i] }; }), large)
          .save("QR-stickers-" + fileName().replace(/^bag-/, "") + ".pdf");
      } catch (e) {   // the QR library throws when the link is more than a QR code can hold
        $("stickerResult").className = "notice bad";
        $("stickerResult").textContent = "This kit list is too long to fit in a QR code. Split the bag into " +
          "smaller kit lists, or shorten the item names.";
        $("stickerResult").hidden = false;
        return;
      }
      $("stickerResult").className = "notice good";
      $("stickerResult").textContent = "Downloaded " + (numbers.length === 1 ? (large ? "four" : "six") + " stickers" :
        numbers.length + " sheets of " + (large ? "four" : "six") + " stickers, one per bag number") +
        (long ? ", large because the kit list is long." : ".");
      $("stickerResult").hidden = false;
    });
  });

  /* Opened from a bag's sticker: a check of that bag, or today's check carried on. */
  function applyLink(v) {
    var same = v.bagName === (bag.bagName || "").trim() && v.bagNumber === (bag.bagNumber || "").trim();
    var name = v.bagNumber || v.bagName || "this bag";
    // Anything entered for this check, so scanning the sticker again never wipes it.
    var c = bag.check;
    var filled = function (rows) {   // counts and notes, or a pouch's seal details
      return Object.keys(rows).some(function (k) { var r = rows[k]; return r.found || r.note || r.intact || r.newSeal; });
    };
    var started = !!c && (filled(c.results) || filled(c.seals) || !!(c.bagSealFound || c.bagNewSeal) ||
      c.crew.some(function (m) { return m.name || m.sig; }));
    showTab("check");
    if (same && started && bag.check.date === todayIso()) {
      $("scanResult").textContent = "Carrying on with today’s check of " + name + ".";
      $("scanResult").hidden = false;
      return;
    }
    if (!same && bag.pouches.length && !confirm("Check " + name + "? This replaces " +
      ((bag.bagNumber || bag.bagName || "the bag").trim()) + " on this device. Export it first if you want to keep it.")) return;
    if (!same) {
      bag.bagName = v.bagName;
      bag.bagNumber = v.bagNumber;
      bag.location = v.location;
      bag.sealNumber = "";
      bag.pouches = v.pouches;
      if (!(bag.companyName || "").trim()) {
        var profile = savedProfile();
        if (profile) useCompany(profile, "Using");
      }
    }
    bag.check = newCheck();
    save();
    fillSetup();
    renderPouches();
    renderCheck();
    $("scanResult").textContent = "Ready to check " + name + ". Count each pouch, then sign at the bottom.";
    $("scanResult").hidden = false;
  }

  function fromLink() {
    if (!location.hash) return;
    window.Shared.readLink(location.hash).then(function (p) {
      history.replaceState(null, "", location.href.split("#")[0]);
      if (!p || !Array.isArray(p.pouches)) {
        $("scanResult").className = "notice bad";
        $("scanResult").textContent = "That link could not be read.";
        $("scanResult").hidden = false;
        showTab("check");
        return;
      }
      $("scanResult").className = "notice good";
      applyLink({
        bagName: String(p.bagName || ""), bagNumber: String(p.bagNumber || ""), location: String(p.location || ""),
        pouches: p.pouches.filter(Array.isArray).map(function (q) {
          return { name: String(q[0] || ""), sealed: q[1] === 1, seal: "",
            items: (Array.isArray(q[2]) ? q[2] : []).filter(Array.isArray).map(function (it) {
              return { name: String(it[0] || ""), min: minOf(it[1]) };
            }) };
        })
      });
    });
  }
  window.addEventListener("hashchange", fromLink);

  $("resetAll").addEventListener("click", function () {
    if (!confirm("Clear this bag? Export it first if you want to keep it.")) return;
    bag = blank();
    save(); fillSetup(); renderPouches(); showTab("setup");
  });

  load();
  fillSetup();
  renderPouches();
  showProfileButton();
  fromLink();
})();
