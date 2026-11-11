/* Vehicle Check: a daily ambulance check, its defects and a signed sheet.
   Everything is kept in localStorage on this device. */
(function () {
  "use strict";

  var KEY = "vehicle-check/v1";
  var PROFILE_KEY = "company-profile/v1";   // written by the Company Profile app
  var FORMAT = "vehicle-check/check";
  var FIELDS = ["callsign", "reg", "makeModel", "mileage", "fuel", "checkedBy", "date", "time", "reportedTo"];
  var COMPANY_TEXT = ["companyName", "companyPhone", "companyAddress", "cqcNumber"];
  var STATUSES = [["ok", "OK"], ["defect", "Defect"], ["na", "N/A"]];
  var $ = function (id) { return document.getElementById(id); };

  /* A starting point: every service's list differs, so it can be edited. */
  var STANDARD = [
    ["Outside", ["Headlights, indicators and brake lights", "Blue lights and sirens", "Tyres and wheels",
      "Bodywork damage", "Windscreen, wipers and washers", "Mirrors"]],
    ["Fluids", ["Engine oil", "Coolant", "Screen wash", "No leaks under the vehicle"]],
    ["Cab", ["Dashboard warning lights", "Horn", "Radio and comms", "Sat nav", "Seatbelts"]],
    ["Saloon", ["Stretcher and its locks", "Carry chair", "Main oxygen cylinder", "Portable oxygen",
      "Suction", "Defibrillator self-test", "Lighting and heating", "Clean and tidy",
      "Sharps bin", "Clinical waste"]],
    ["Equipment", ["Response bags on board", "Drug bag sealed", "Fire extinguisher", "Spill kit", "PPE and hi-vis"]]
  ];

  function standardSections() {
    return STANDARD.map(function (s) {
      return { name: s[0], items: s[1].map(function (n) { return { name: n, status: "", note: "" }; }) };
    });
  }

  function blank() {
    var c = { company: null, fit: "", sections: standardSections() };
    FIELDS.forEach(function (f) { c[f] = ""; });
    return c;
  }
  var chk = blank();

  /* ---------------- cleaning: storage and opened files are not trusted ---------------- */
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function str(v) { return typeof v === "string" ? v : ""; }

  function cleanCompany(raw) {
    if (!isObj(raw) || typeof raw.companyName !== "string") return null;
    var out = { cqcRegistered: raw.cqcRegistered === true };
    COMPANY_TEXT.forEach(function (f) { out[f] = str(raw[f]); });
    if (typeof raw.logo === "string" && raw.logo.indexOf("data:image/") === 0) {
      out.logo = raw.logo; out.logoW = +raw.logoW || 0; out.logoH = +raw.logoH || 0;
    }
    return out;
  }

  function clean(raw) {
    var out = blank();
    if (!isObj(raw)) return out;
    FIELDS.forEach(function (f) { out[f] = str(raw[f]); });
    out.company = cleanCompany(raw.company);
    out.fit = raw.fit === "yes" || raw.fit === "no" ? raw.fit : "";
    if (Array.isArray(raw.sections)) {
      out.sections = raw.sections.filter(isObj).map(function (s) {
        return { name: str(s.name), items: (Array.isArray(s.items) ? s.items : []).filter(isObj).map(function (i) {
          var st = str(i.status);
          return { name: str(i.name), status: ["ok", "defect", "na"].indexOf(st) >= 0 ? st : "", note: str(i.note) };
        }) };
      });
    }
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(chk)); return true; } catch (e) { return false; }
  }
  function load() {
    try { chk = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { chk = blank(); }
  }

  /* ---------------- small DOM helpers ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function message(id, kind, text) {
    $(id).className = "notice " + kind;
    $(id).textContent = text;
    $(id).hidden = false;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  /* ---------------- company ---------------- */
  function savedProfile() {
    var p;
    try { p = cleanCompany(JSON.parse(localStorage.getItem(PROFILE_KEY))); } catch (e) { p = null; }
    return p && p.companyName.trim() ? p : null;
  }

  function showCompany() {
    var c = chk.company, box = $("companySummary");
    box.innerHTML = "";
    if (!c || !c.companyName.trim()) {
      box.appendChild(el("p", "empty", "No company details yet. Use your saved company profile, import " +
        "a company file, or create a profile first."));
    } else {
      if (c.logo) {
        var pic = el("span", "logo-preview"), img = el("img");
        img.src = c.logo;
        img.alt = "";
        pic.appendChild(img);
        box.appendChild(pic);
      }
      var text = el("div");
      text.appendChild(el("strong", "", c.companyName));
      var bits = [c.companyPhone, c.cqcRegistered && c.cqcNumber ? "CQC " + c.cqcNumber : ""].filter(Boolean)
        .join("  ·  ");
      if (bits) text.appendChild(el("span", "echo", bits));
      box.appendChild(text);
    }
    var p = savedProfile();
    $("companyUseBtn").hidden = !p;
    if (p) $("companyUseBtn").textContent = "Use saved company profile (" + p.companyName.trim() + ")";
  }

  function setCompany(c, how) {
    chk.company = c;
    save();
    showCompany();
    message("companyResult", "good", how + " company details for " + (c.companyName.trim() || "this organisation") +
      (c.logo ? ", including the logo." : "."));
  }

  $("companyUseBtn").addEventListener("click", function () {
    var p = savedProfile();
    if (p) setCompany(p, "Using");
  });
  $("companyImportBtn").addEventListener("click", function () { $("companyFile").click(); });
  $("companyFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { message("companyResult", "bad", "That file could not be read."); };
    reader.onload = function () {
      var parsed, c = null;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      if (isObj(parsed)) c = cleanCompany(parsed) || cleanCompany(parsed.company) || cleanCompany(parsed.setup);
      if (!c) {
        message("companyResult", "bad", "“" + file.name + "” does not contain company details. " +
          "Nothing has been changed.");
        return;
      }
      setCompany(c, "Loaded");
    };
    reader.readAsText(file);
  });

  /* ---------------- vehicle ---------------- */
  function fill() {
    FIELDS.forEach(function (f) { $(f).value = chk[f]; });
    $("fitYes").checked = chk.fit === "yes";
    $("fitNo").checked = chk.fit === "no";
    $("fitBlank").checked = !chk.fit;
  }
  FIELDS.forEach(function (f) {
    $(f).addEventListener(f === "fuel" ? "change" : "input", function () { chk[f] = $(f).value; save(); });
  });
  ["fitYes", "fitNo", "fitBlank"].forEach(function (id) {
    $(id).addEventListener("change", function () { chk.fit = this.value; save(); });
  });

  /* ---------------- checks ---------------- */
  var editing = false;

  function counts() {
    var c = { ok: 0, defect: 0, na: 0, "": 0 };
    chk.sections.forEach(function (s) { s.items.forEach(function (i) { c[i.status]++; }); });
    return c;
  }

  function summaryText() {
    var c = counts();
    return c.ok + " OK  ·  " + c.defect + (c.defect === 1 ? " defect" : " defects") + "  ·  " +
      c.na + " N/A  ·  " + c[""] + " not checked";
  }

  function refreshCounts() {
    $("checkSummary").textContent = summaryText();
    $("defectCount").textContent = counts().defect;
  }

  function renderItem(sec, item, ii) {
    var row = el("div", "check-row-item");
    var name = el("div", "item-name");
    if (editing) {
      var input = el("input");
      input.type = "text";
      input.value = item.name;
      input.setAttribute("aria-label", "Check item");
      input.addEventListener("input", function () { item.name = input.value; save(); });
      name.appendChild(input);
    } else {
      name.textContent = item.name;
    }
    row.appendChild(name);

    if (editing) {
      var del = el("button", "icon-btn del", "×");
      del.type = "button";
      del.setAttribute("aria-label", "Remove " + item.name);
      del.addEventListener("click", function () { sec.items.splice(ii, 1); save(); render(); });
      row.appendChild(del);
      return row;
    }

    var group = el("div", "status");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", item.name);
    var note = el("input", "item-note");
    note.type = "text";
    note.value = item.note;
    note.setAttribute("aria-label", "Note for " + item.name);
    note.placeholder = "What is wrong, and what was done about it";
    function showNote() {
      note.hidden = item.status !== "defect" && !item.note;
      note.classList.toggle("needed", item.status === "defect" && !item.note.trim());
    }
    note.addEventListener("input", function () { item.note = note.value; save(); showNote(); });
    STATUSES.forEach(function (s) {
      var b = el("button", s[0], s[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", item.status === s[0]);
      b.addEventListener("click", function () {
        // Pressing the chosen one again clears it.
        item.status = item.status === s[0] ? "" : s[0];
        save();
        group.querySelectorAll("button").forEach(function (x) {
          x.setAttribute("aria-pressed", x.className === item.status);
        });
        showNote();
        refreshCounts();
        if (item.status === "defect" && !item.note) note.focus();
      });
      group.appendChild(b);
    });
    row.appendChild(group);
    row.appendChild(note);
    showNote();
    return row;
  }

  function render() {
    var list = $("sectionList");
    list.innerHTML = "";
    chk.sections.forEach(function (sec) {
      var card = el("div", "card");
      card.appendChild(el("h2", "", sec.name));
      sec.items.forEach(function (item, ii) { card.appendChild(renderItem(sec, item, ii)); });
      if (editing) {
        var form = el("form", "add-check");
        var input = el("input");
        input.type = "text";
        input.placeholder = "Add a check to " + sec.name;
        input.setAttribute("aria-label", "New check for " + sec.name);
        var add = el("button", "btn primary small", "Add");
        add.type = "submit";
        form.appendChild(input);
        form.appendChild(add);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          if (!input.value.trim()) return;
          sec.items.push({ name: input.value.trim(), status: "", note: "" });
          save();
          render();
          list.querySelectorAll(".add-check input")[chk.sections.indexOf(sec)].focus();
        });
        card.appendChild(form);
      }
      list.appendChild(card);
    });
    refreshCounts();
  }

  $("editToggle").addEventListener("click", function () {
    editing = !editing;
    this.setAttribute("aria-pressed", editing);
    this.textContent = editing ? "Done editing" : "Edit checklist";
    $("resetList").hidden = !editing;
    $("allOk").hidden = editing;
    render();
  });
  $("resetList").addEventListener("click", function () {
    if (!confirm("Replace your checklist with the standard one? Results on this check are cleared.")) return;
    chk.sections = standardSections();
    save();
    render();
  });
  $("allOk").addEventListener("click", function () {
    var n = counts()[""];
    if (!n) return;
    if (!confirm("Mark the " + n + " items not yet checked as OK?")) return;
    chk.sections.forEach(function (s) { s.items.forEach(function (i) { if (!i.status) i.status = "ok"; }); });
    save();
    render();
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
    if (name === "generate") {
      $("genSummary").hidden = false;
      $("genSummary").textContent = summaryText() + ".";
    }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.goto); });
  });

  /* ---------------- generate ---------------- */
  /* Blanks are allowed (a paper check), but a defect must say what is wrong. */
  function problems() {
    var out = [];
    chk.sections.forEach(function (s) {
      s.items.forEach(function (i) {
        if (i.status === "defect" && !i.note.trim()) out.push("Add a note to the defect “" + i.name + "” (Checks).");
      });
    });
    return out;
  }

  function slug(s) { return s.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function fileBase() { return slug([chk.reg || chk.callsign, chk.date].join(" ")) || "vehicle"; }

  function build() {
    var errs = problems();
    $("genError").hidden = !errs.length;
    $("genError").textContent = errs.join(" ");
    if (errs.length) { showTab("generate"); return null; }
    return window.VehicleCheckPDF.build(chk);
  }
  function download() {
    var pdf = build();
    if (pdf) pdf.save("Vehicle-check-" + fileBase() + ".pdf");
  }
  $("generateBtn").addEventListener("click", download);
  $("generateTop").addEventListener("click", download);
  $("previewBtn").addEventListener("click", function () {
    var pdf = build();
    if (pdf) window.open(pdf.output("bloburl"), "_blank");
  });

  /* ---------------- save / open / new ---------------- */
  $("exportBtn").addEventListener("click", function () {
    if (!chk.reg.trim() && !chk.callsign.trim()) {
      message("saveResult", "bad", "Enter the vehicle's registration or callsign first (Vehicle).");
      return;
    }
    var name = "Vehicle-check-" + fileBase() + ".json";
    var url = URL.createObjectURL(new Blob([JSON.stringify(Object.assign({ format: FORMAT, version: 1 }, chk), null, 2)],
      { type: "application/json" }));
    var a = el("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    message("saveResult", "good", "Saved as " + name + ".");
  });

  $("openBtn").addEventListener("click", function () { $("openFile").click(); });
  $("openFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { message("openResult", "bad", "That file could not be read."); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      if (!isObj(parsed) || parsed.format !== FORMAT) {
        message("openResult", "bad", "“" + file.name + "” is not a check saved from this tool. " +
          "Nothing has been changed.");
        return;
      }
      if (!confirm("Replace the check you have now with “" + file.name + "”?")) return;
      var next = clean(parsed);
      if (!next.company) next.company = chk.company;
      chk = next;
      save();
      fill();
      showCompany();
      render();
      message("openResult", "good", "Opened “" + file.name + "”.");
    };
    reader.readAsText(file);
  });

  /* The next day's check: same vehicle and checklist, results cleared, today's date and time. */
  $("newCheck").addEventListener("click", function () {
    if (!confirm("Start a new check? The results, mileage, fuel, defects and sign-off are cleared; the " +
      "vehicle and your checklist are kept. Save this check first if you want it.")) return;
    chk.sections.forEach(function (s) { s.items.forEach(function (i) { i.status = ""; i.note = ""; }); });
    ["mileage", "fuel", "checkedBy", "reportedTo"].forEach(function (f) { chk[f] = ""; });
    chk.fit = "";
    chk.date = today();
    chk.time = nowTime();
    save();
    fill();
    render();
    showTab("vehicle");
  });

  load();
  // The company comes from the saved profile until something else is chosen.
  if (!chk.company) chk.company = savedProfile();
  save();   // so the standard checklist is stored from the first visit
  fill();
  showCompany();
  render();
})();
