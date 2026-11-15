/* Event CAD: setup, live calls and units, the treatment centre count, the control
   log and the end-of-event report. Everything is kept in localStorage on this one
   device; export the CAD to keep it or move it. */
(function () {
  "use strict";
  var C = window.CAD;
  var W3W_KEY = "ambulance-tools/what3words-key";   // kept out of every export and backup
  var $ = function (id) { return document.getElementById(id); };
  var cad = C.blank();
  var current = 0;       // the call in the call sheet
  var unitForm = null;   // { unit, kind }: the break or unavailable form that is open
  var beeped = {};       // breaks already announced with a beep

  /* ---------------- storage ---------------- */
  function save() {
    var ok = true;
    try { localStorage.setItem(C.KEY, JSON.stringify(cad)); } catch (e) { ok = false; }
    $("saveWarn").hidden = ok;
    backupSoon();
    return ok;
  }
  function load() {
    try { cad = C.clean(JSON.parse(localStorage.getItem(C.KEY))); } catch (e) { cad = C.blank(); }
  }
  /* Something changed: store it and bring the live views up to date. */
  function changed() { save(); refresh(); }

  function w3wKey() { try { return localStorage.getItem(W3W_KEY) || ""; } catch (e) { return ""; } }

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
  function btn(label, cls, onClick, aria) {
    var b = el("button", "btn " + (cls || "ghost small"), label);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  }
  function field(label, control, cls) {
    // Named by the label alone: a wrapped select or box would otherwise add its own value to the name.
    if (!control.hasAttribute("aria-label")) control.setAttribute("aria-label", label);
    var f = el("label", "field" + (cls ? " " + cls : ""));
    f.appendChild(el("span", "", label));
    f.appendChild(control);
    return f;
  }
  function textIn(value, onInput, placeholder) {
    var i = el("input");
    i.type = "text";
    i.value = value || "";
    if (placeholder) i.placeholder = placeholder;
    i.addEventListener("input", function () { onInput(i.value); });
    return i;
  }
  function area(value, onInput, placeholder) {
    var t = el("textarea");
    t.rows = 3;
    t.value = value || "";
    if (placeholder) t.placeholder = placeholder;
    t.addEventListener("input", function () { onInput(t.value); });
    return t;
  }
  function pick(options, value, onChange) {
    var s = el("select");
    options.forEach(function (o) {
      var opt = el("option", "", o[1]);
      opt.value = o[0];
      s.appendChild(opt);
    });
    s.value = value;
    if (onChange) s.addEventListener("change", function () { onChange(s.value); });
    return s;
  }
  function when(value, onChange) {
    var i = el("input");
    i.type = "datetime-local";
    i.value = value || "";
    i.addEventListener("change", function () { onChange(C.stamp(i.value)); });
    return i;
  }
  function tick(label, checked, onChange) {
    var l = el("label", "check-row"), i = el("input");
    i.type = "checkbox";
    i.checked = !!checked;
    i.addEventListener("change", function () { onChange(i.checked); });
    l.appendChild(i);
    l.appendChild(el("span", "", label));
    return l;
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = el("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function json(data) { return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); }
  function readJson(input, done) {
    var file = input.files[0];
    input.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      done(parsed, file.name);
    };
    reader.onerror = function () { done(null, file.name); };
    reader.readAsText(file);
  }
  function slug(s) { return String(s || "").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
  function fileBase() { return (slug(cad.event.name) || "event") + "-" + (cad.event.start || C.now()).slice(0, 10); }
  function nextId(prefix) { cad.seq += 1; return prefix + cad.seq; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function str(v) { return typeof v === "string" ? v : ""; }

  /* Locations for a dropdown, standby points first. */
  function placeOptions() {
    var order = { standby: 0, tc: 1, poi: 2 };
    return cad.places.filter(function (p) { return p.name.trim(); }).slice().sort(function (a, b) {
      return order[a.kind] - order[b.kind];
    }).map(function (p) {
      return [p.id, p.name + (p.kind === "standby" ? " (standby)" : p.kind === "tc" ? " (treatment centre)" : "")];
    });
  }

  /* A short beep when a break ends. Browsers allow sound once the page has been clicked. */
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = beep.ctx || (beep.ctx = new Ctx()), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch (e) { /* no sound: the amber alert still shows */ }
  }

  /* ---------------- tabs ---------------- */
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + name); });
    // The time boxes start at now each visit, so they never keep a time from earlier.
    if (name === "tc") { $("tcTime").value = C.now(); renderTc(); }
    if (name === "log") ["logTime", "casTime", "cdTime", "psTime"].forEach(function (id) { $(id).value = C.now(); });
    if (name === "report") renderReportSummary();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.goto); });
  });

  /* ================= SETUP ================= */

  /* ---------------- company ---------------- */
  function showCompany() {
    var c = cad.company, box = $("companySummary");
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
      var bits = [c.companyPhone, c.cqcRegistered && c.cqcNumber ? "CQC " + c.cqcNumber : ""].filter(Boolean).join("  ·  ");
      if (bits) text.appendChild(el("span", "echo", bits));
      box.appendChild(text);
    }
    var p = window.Shared.savedCompany();
    $("companyUseBtn").hidden = !p;
    if (p) $("companyUseBtn").textContent = "Use saved company profile (" + p.companyName.trim() + ")";
  }
  function setCompany(c, how) {
    cad.company = c;
    save();
    showCompany();
    message("companyResult", "good", how + " company details for " + (c.companyName.trim() || "this organisation") +
      (c.logo ? ", including the logo." : "."));
  }
  $("companyUseBtn").addEventListener("click", function () {
    var p = window.Shared.savedCompany();
    if (p) setCompany(p, "Using");
  });
  $("companyImportBtn").addEventListener("click", function () { $("companyFile").click(); });
  $("companyFile").addEventListener("change", function () {
    readJson(this, function (parsed, name) {
      var c = window.Shared.company(parsed);
      if (!c) {
        message("companyResult", "bad", "“" + name + "” does not contain company details. Nothing has been changed.");
        return;
      }
      setCompany(c, "Loaded");
    });
  });

  /* ---------------- event and alerts ---------------- */
  var EVENT_IDS = [["evName", "name"], ["evVenue", "venue"], ["evStart", "start"], ["evEnd", "end"], ["evLead", "lead"],
    ["evControl", "control"], ["evCrowd", "crowd"]];
  function fillSetup() {
    $("gridCols").value = cad.settings.mapGrid.cols || "";
    $("gridRows").value = cad.settings.mapGrid.rows || "";
    $("phrases").value = cad.settings.phrases.join("\n");
    C.CATEGORIES.forEach(function (k) { $("target" + k[0]).value = cad.settings.targets[k[0]] || ""; });
    EVENT_IDS.forEach(function (f) { $(f[0]).value = cad.event[f[1]] || ""; });
    $("unassignedMins").value = cad.settings.unassignedMins;
    $("onSceneMins").value = cad.settings.onSceneMins;
    $("w3wKey").value = w3wKey();
    $("controller").value = cad.controller;
  }
  EVENT_IDS.forEach(function (f) {
    var dated = f[1] === "start" || f[1] === "end";
    $(f[0]).addEventListener(dated ? "change" : "input", function () {
      var v = $(f[0]).value;
      cad.event[f[1]] = dated ? C.stamp(v) : f[1] === "crowd" ? Math.max(0, parseInt(v, 10) || 0) : v;
      changed();
    });
  });
  [["unassignedMins", 5], ["onSceneMins", 20]].forEach(function (f) {
    $(f[0]).addEventListener("input", function () {
      var n = parseInt($(f[0]).value, 10);
      cad.settings[f[0]] = n >= 1 && n <= 600 ? n : f[1];
      changed();
    });
  });
  C.CATEGORIES.forEach(function (k) {
    $("target" + k[0]).addEventListener("input", function () {
      var n = parseInt($("target" + k[0]).value, 10);
      cad.settings.targets[k[0]] = n >= 1 && n <= 1440 ? n : 0;
      changed();
    });
  });
  [["gridCols", "cols", 26], ["gridRows", "rows", 99]].forEach(function (f) {
    $(f[0]).addEventListener("input", function () {
      var n = parseInt($(f[0]).value, 10);
      cad.settings.mapGrid[f[1]] = n >= 1 && n <= f[2] ? n : 0;
      changed();
    });
  });
  $("phrases").addEventListener("input", function () {
    cad.settings.phrases = $("phrases").value.split("\n").map(function (p) { return p.trim(); })
      .filter(Boolean).slice(0, 20);
    changed();
  });
  $("w3wKey").addEventListener("input", function () {
    try { localStorage.setItem(W3W_KEY, $("w3wKey").value.trim()); } catch (e) { /* asked again next time */ }
  });

  /* ---------------- units ---------------- */
  function newUnit() { return { id: nextId("u"), callsign: "", type: "Other", reg: "", at: "", staff: [], history: [], crewLog: [] }; }
  function unitUsed(id) { return cad.calls.some(function (c) { return c.units.some(function (a) { return a.unit === id; }); }); }

  function renderUnits() {
    var box = $("unitList");
    box.innerHTML = "";
    if (!cad.units.length) box.appendChild(el("p", "empty", "No units yet. Add them, or load them from Deployment Maker."));
    cad.units.forEach(function (u, ui) {
      var card = el("div", "unit-edit"), row = el("div", "unit-row");
      row.appendChild(field("Callsign", textIn(u.callsign, function (v) { u.callsign = v; changed(); }, "e.g. Alpha 1")));
      row.appendChild(field("Type", pick(C.UNIT_TYPES.map(function (t) { return [t, t]; }), u.type, function (v) {
        u.type = v;
        changed();
        renderUnits();
      })));
      if (u.type === "Ambulance") {
        row.appendChild(field("Registration", textIn(u.reg, function (v) { u.reg = v; changed(); }, "e.g. AB12 CDE")));
      }
      row.appendChild(field("Starts at", pick([["", "Not set"]].concat(placeOptions()), u.at, function (v) {
        u.at = v;
        changed();
      })));
      row.appendChild(btn("Remove unit", "ghost small del", function () {
        if (unitUsed(u.id)) {
          message("dmResult", "bad", (u.callsign || "That unit") + " is on calls, so it can't be removed. Rename it instead.");
          return;
        }
        if (!confirm("Remove " + (u.callsign || "this unit") + "?")) return;
        cad.units.splice(ui, 1);
        changed();
        renderUnits();
      }, "Remove unit " + (u.callsign || ui + 1)));
      card.appendChild(row);
      u.staff.forEach(function (p, pi) {
        var line = el("div", "staff-line");
        line.appendChild(textIn(p.name, function (v) { p.name = v; changed(); }, "Name"));
        var grade = textIn(p.grade, function (v) { p.grade = v; changed(); }, "Clinical grade");
        grade.setAttribute("list", "grades");
        line.appendChild(grade);
        line.appendChild(btn("Remove", "ghost small", function () {
          u.staff.splice(pi, 1);
          changed();
          renderUnits();
        }, "Remove " + (p.name || "staff member") + " from " + (u.callsign || "the unit")));
        card.appendChild(line);
      });
      card.appendChild(btn("+ Add staff", "ghost small add-staff", function () {
        u.staff.push({ name: "", grade: "" });
        changed();
        renderUnits();
      }));
      box.appendChild(card);
    });
  }
  $("addUnit").addEventListener("click", function () {
    cad.units.push(newUnit());
    changed();
    renderUnits();
    var inputs = $("unitList").querySelectorAll(".unit-row input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  /* ---------------- units from Deployment Maker ---------------- */
  function dmSources() {
    var list = [];
    try {
      var d = JSON.parse(localStorage.getItem("deployment-maker/v1"));
      if (isObj(d) && Array.isArray(d.units) && d.units.length) {
        list.push(["Deployment Maker", "The deployment open in Deployment Maker" + (str(d.eventName) ? ": " + d.eventName : ""), d]);
      }
    } catch (e) { /* nothing usable */ }
    try {
      var plans = JSON.parse(localStorage.getItem("deployment-maker/plans"));
      (Array.isArray(plans) ? plans : []).forEach(function (p) {
        if (isObj(p) && isObj(p.plan) && Array.isArray(p.plan.units)) {
          list.push(["the plan “" + str(p.name) + "”", "Saved plan: " + str(p.name), p.plan]);
        }
      });
    } catch (e) { /* nothing usable */ }
    return list;
  }
  function renderDm() {
    var s = dmSources(), sel = $("dmPick");
    sel.innerHTML = "";
    s.forEach(function (o, i) {
      var opt = el("option", "", o[1]);
      opt.value = i;
      sel.appendChild(opt);
    });
    $("dmRow").hidden = !s.length;
  }
  /* The location's place, added as a standby point if it is new. */
  function placeFor(name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < cad.places.length; i++) if (cad.places[i].name.trim().toLowerCase() === lower) return cad.places[i].id;
    var p = { id: nextId("p"), name: name, kind: "standby" };
    cad.places.push(p);
    return p.id;
  }
  function loadDeployment(d, from) {
    if (!isObj(d) || !Array.isArray(d.units)) {
      message("dmResult", "bad", "That is not a Deployment Maker deployment or plan. Nothing has been changed.");
      return;
    }
    if (cad.units.some(function (u) { return unitUsed(u.id); })) {
      message("dmResult", "bad", "Units are already on calls, so they can't be replaced. Add any new units by hand.");
      return;
    }
    if (cad.units.length && !confirm("Replace the " + cad.units.length + " units set up now with the units from " + from + "?")) return;
    cad.units = d.units.filter(isObj).map(function (raw) {
      var u = newUnit(), where = raw.roaming === true ? "" : str(raw.location).trim();
      u.callsign = str(raw.callsign);
      u.type = raw.ambulance === true ? "Ambulance" : "Other";
      u.reg = str(raw.reg);
      u.staff = (Array.isArray(raw.staff) ? raw.staff : []).filter(isObj).map(function (p) {
        return { name: str(p.name), grade: str(p.grade) };
      });
      if (where) u.at = placeFor(where);
      return u;
    });
    if (!cad.event.name && str(d.eventName)) cad.event.name = d.eventName;
    if (!cad.event.venue && str(d.venue)) cad.event.venue = d.venue;
    changed();
    fillSetup();
    renderSetup();
    message("dmResult", "good", "Loaded " + cad.units.length + (cad.units.length === 1 ? " unit" : " units") + " from " +
      from + ". Deployment Maker only knows which are ambulances, so set the type of the others.");
  }
  $("dmLoad").addEventListener("click", function () {
    var s = dmSources()[+$("dmPick").value];
    if (s) loadDeployment(s[2], s[0]);
  });
  $("dmFileBtn").addEventListener("click", function () { $("dmFile").click(); });
  $("dmFile").addEventListener("change", function () {
    readJson(this, function (parsed, name) { loadDeployment(parsed, "“" + name + "”"); });
  });

  /* ---------------- locations and hospitals ---------------- */
  function placeUsed(id) {
    return cad.calls.some(function (c) {
      return c.place === id || c.units.some(function (a) { return a.dest === id; });
    }) || cad.tc.some(function (t) { return t.place === id; });
  }
  function renderPlaces() {
    var box = $("placeList");
    box.innerHTML = "";
    if (!cad.places.length) box.appendChild(el("p", "empty", "No locations yet."));
    cad.places.forEach(function (p, i) {
      var line = el("div", "place-line with-refs");
      var grid = textIn(p.grid, function (v) { p.grid = v.trim(); changed(); }, "Grid");
      var words = textIn(p.w3w ? "///" + p.w3w : "", function (v) { p.w3w = C.w3w(v); changed(); }, "///what3words");
      // The boxes beside a location are named after it, as it is typed.
      var label = function () {
        grid.setAttribute("aria-label", "Grid ref of " + (p.name || "this location"));
        words.setAttribute("aria-label", "what3words of " + (p.name || "this location"));
      };
      var name = textIn(p.name, function (v) { p.name = v; changed(); label(); }, "e.g. Main stage, Gate B, Treatment centre");
      name.setAttribute("aria-label", "Location name");
      line.appendChild(name);
      var kind = pick(C.PLACE_KINDS, p.kind, function (v) { p.kind = v; changed(); });
      kind.setAttribute("aria-label", "Kind of location");
      line.appendChild(kind);
      label();
      line.appendChild(grid);
      line.appendChild(words);
      line.appendChild(btn("Remove", "ghost small", function () {
        if (placeUsed(p.id)) {
          alert((p.name || "That location") + " is used on calls or treatment centre counts, so it can't be removed. " +
            "Rename it instead.");
          return;
        }
        cad.places.splice(i, 1);
        cad.units.forEach(function (u) { if (u.at === p.id) u.at = ""; });
        changed();
        renderSetup();
      }, "Remove location " + (p.name || i + 1)));
      box.appendChild(line);
    });
  }
  $("addPlace").addEventListener("click", function () {
    cad.places.push({ id: nextId("p"), name: "", kind: "standby" });
    changed();
    renderPlaces();
    var inputs = $("placeList").querySelectorAll("input");
    inputs[inputs.length - 1].focus();
  });
  // Names typed into a location show up in the unit and call dropdowns once you leave the box.
  $("placeList").addEventListener("change", function () { renderUnits(); renderWalkUps(); });

  function renderHospitals() {
    var box = $("hospitalRows");
    box.innerHTML = "";
    if (!cad.hospitals.length) box.appendChild(el("p", "empty", "No hospitals yet."));
    cad.hospitals.forEach(function (h, i) {
      var line = el("div", "place-line hospital-line");
      var name = textIn(h, function (v) { cad.hospitals[i] = v; changed(); }, "e.g. Royal Infirmary");
      name.setAttribute("aria-label", "Hospital name");
      line.appendChild(name);
      line.appendChild(btn("Remove", "ghost small", function () {
        cad.hospitals.splice(i, 1);
        changed();
        renderHospitals();
      }, "Remove hospital " + (h || i + 1)));
      box.appendChild(line);
    });
    var list = $("hospitalList");
    list.innerHTML = "";
    cad.hospitals.forEach(function (h) {
      if (!h.trim()) return;
      var o = el("option"), s = cad.hospitalStatus[h];
      o.value = h;
      if (s) o.label = s.status === "divert" ? "ON DIVERT" : "Under pressure";
      list.appendChild(o);
    });
    renderHospitalStatus();
  }

  /* Each hospital's status, set on the CAD tab as it changes. */
  function renderHospitalStatus() {
    var box = $("hospitalStatusList"), names = cad.hospitals.filter(function (h) { return h.trim(); });
    $("hospitalCard").hidden = !names.length;
    box.innerHTML = "";
    names.forEach(function (h) {
      var s = cad.hospitalStatus[h] || { status: "", note: "" }, row = el("div", "hospital-status " + s.status);
      row.appendChild(el("strong", "", h));
      var status = pick(C.HOSPITAL_STATUS, s.status, function (v) {
        if (v) cad.hospitalStatus[h] = { status: v, note: note.value.trim(), since: C.now() };
        else delete cad.hospitalStatus[h];
        cad.log.push({ time: C.now(), by: cad.controller, text: "Hospital status: " + h + " " +
          (v === "divert" ? "on divert" : v === "pressure" ? "under pressure" : "back to normal") +
          (v && note.value.trim() ? " (" + note.value.trim() + ")" : "") });
        changed();
        renderHospitals();
        renderLog();
      });
      status.setAttribute("aria-label", "Status of " + h);
      row.appendChild(status);
      var note = textIn(s.note, function (v) { if (cad.hospitalStatus[h]) { cad.hospitalStatus[h].note = v; changed(); } },
        "Note, e.g. ED full until 18:00");
      note.setAttribute("aria-label", "Note on " + h);
      row.appendChild(note);
      box.appendChild(row);
    });
  }
  $("addHospital").addEventListener("click", function () {
    cad.hospitals.push("");
    changed();
    renderHospitals();
    var inputs = $("hospitalRows").querySelectorAll("input");
    inputs[inputs.length - 1].focus();
  });
  $("hospitalRows").addEventListener("change", renderHospitals);

  function renderSetup() {
    renderUnits();
    renderPlaces();
    renderHospitals();
    renderDm();
  }

  /* ---------------- save and open the setup ---------------- */
  $("setupExport").addEventListener("click", function () {
    var name = "CAD-setup-" + (slug(cad.event.name) || "event") + ".json";
    download(json(Object.assign(C.setupOf(cad), { siteMap: siteMap })), name);
    message("setupResult", "good", "Saved the setup as " + name + ".");
  });
  $("setupImport").addEventListener("click", function () { $("setupFile").click(); });
  $("setupFile").addEventListener("change", function () {
    readJson(this, function (parsed, name) {
      if (!isObj(parsed) || (parsed.format !== C.SETUP_FORMAT && parsed.format !== C.FORMAT)) {
        message("setupResult", "bad", "“" + name + "” is not a CAD setup or CAD file. Nothing has been changed.");
        return;
      }
      if (cad.calls.length) {
        message("setupResult", "bad", "Calls have been logged, so the setup can't be replaced. Start a new event on " +
          "the Report tab first.");
        return;
      }
      if ((cad.units.length || cad.places.length) && !confirm("Replace this setup with “" + name + "”?")) return;
      var next = C.clean(parsed);
      takeMap(parsed);
      next.calls = [];
      next.tc = [];
      next.log = [];
      next.methane = [];
      next.casualties = [];
      next.conditions = [];
      next.persons = [];
      next.hospitalStatus = {};
      next.finalised = "";
      next.finalisedBy = "";
      next.units.forEach(function (u) { u.history = []; u.crewLog = []; });
      next.controller = cad.controller;
      if (!next.company) next.company = cad.company;
      cad = next;
      current = 0;
      save();
      renderAll();
      message("setupResult", "good", "Loaded the setup from “" + name + "”.");
    });
  });

  $("paperBtn").addEventListener("click", function () {
    window.CadPDF.paper(cad, siteMap).save("Paper-fallback-" + fileBase() + ".pdf");
  });

  /* ================= CAD ================= */

  /* ---------------- unit status board ---------------- */
  function agoText(since, nowMs) {
    if (!since) return "";
    var m = Math.floor((nowMs - C.ms(since)) / 60000);
    return C.hhmm(since) + (m >= 0 ? " (" + m + " min)" : "");
  }
  function renderBoard() {
    var body = $("boardBody"), nowMs = Date.now();
    body.innerHTML = "";
    if (!cad.units.length) {
      var tr = el("tr"), td = el("td", "empty", "No units yet: add them on the Setup tab.");
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
    }
    cad.units.forEach(function (u) {
      var st = C.unitStatus(cad, u, nowMs), tr = el("tr", "st-" + st.code);
      var name = el("td");
      name.appendChild(el("strong", "", u.callsign || "Unnamed unit"));
      name.appendChild(el("small", "", u.type + (u.reg ? " · " + u.reg : "")));
      tr.appendChild(name);
      var status = el("td");
      status.appendChild(el("span", "badge", st.label));
      if (st.since) status.appendChild(el("small", "", "since " + agoText(st.since, nowMs)));
      if (st.until) {
        var left = Math.ceil((C.ms(st.until) - nowMs) / 60000);
        status.appendChild(el("small", "", left > 0 ? "until " + C.hhmm(st.until) + " (" + left + " min left)"
          : (st.code === "unavailable" ? "expected back " : "due back ") + C.hhmm(st.until)));
      }
      tr.appendChild(status);
      tr.appendChild(el("td", "", (st.call ? "Call " + C.pad3(st.call) + (st.where ? ": " : "") : "") + (st.where || "")));
      var act = el("td", "board-actions");
      if (st.call) {
        act.appendChild(btn("Open call", "ghost small", function () { openCall(st.call); }, "Open call " + st.call + " for " + u.callsign));
      } else if (st.code === "available") {
        act.appendChild(btn("Break", "ghost small", function () { unitForm = { unit: u.id, kind: "break" }; renderUnitForm(); },
          "Break for " + u.callsign));
        act.appendChild(btn("Unavailable", "ghost small", function () { unitForm = { unit: u.id, kind: "unavailable" }; renderUnitForm(); },
          "Unavailable: " + u.callsign));
        act.appendChild(btn("Off duty", "ghost small", function () {
          u.history.push({ kind: "offduty", start: C.now(), until: "", end: "", reason: "" });
          changed();
        }, "Off duty: " + u.callsign));
      } else {
        var back = { unavailable: "Available", offduty: "On duty" }[st.code] || "Back from break";
        act.appendChild(btn(back, "ghost small", function () {
          var p = C.openPeriod(u);
          if (p) p.end = C.now();
          changed();
        }, back + ": " + u.callsign));
      }
      act.appendChild(btn("Crew", "ghost small", function () { unitForm = { unit: u.id, kind: "crew" }; renderUnitForm(); },
        "Crew change: " + u.callsign));
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  /* Staff going off a unit and joining it, mid-event: the unit's staff change and the change is kept. */
  function renderCrewForm(box, u) {
    box.appendChild(el("h3", "", "Crew change: " + (u.callsign || "Unnamed unit")));
    var start = when(C.now(), function () {}), offs = [], ons = [];
    box.appendChild(field("Time", start, "crew-time"));
    var list = el("div", "crew-off");
    if (!u.staff.length) list.appendChild(el("p", "empty", "No staff recorded on this unit."));
    u.staff.forEach(function (p) {
      var t = tick("Going off: " + ([p.name, p.grade].filter(Boolean).join(", ") || "unnamed"), false, function () {});
      offs.push([t.querySelector("input"), p]);
      list.appendChild(t);
    });
    box.appendChild(list);
    var g = el("div", "grid");
    [1, 2].forEach(function (n) {
      var nm = textIn("", function () {}, "Name"), gr = textIn("", function () {}, "Clinical grade");
      gr.setAttribute("list", "grades");
      g.appendChild(field("Coming on: name " + n, nm));
      g.appendChild(field("Clinical grade " + n, gr));
      ons.push([nm, gr]);
    });
    box.appendChild(g);
    var err = el("p", "error");
    err.hidden = true;
    var row = el("div", "actions");
    row.appendChild(btn("Save crew change", "primary small", function () {
      var off = offs.filter(function (x) { return x[0].checked; }).map(function (x) { return x[1]; });
      var on = ons.filter(function (x) { return x[0].value.trim(); }).map(function (x) {
        return { name: x[0].value.trim(), grade: x[1].value.trim() };
      });
      if (!off.length && !on.length) { err.textContent = "Tick who is going off, or add who is coming on."; err.hidden = false; return; }
      var who = function (list) { return list.map(function (p) { return [p.name, p.grade].filter(Boolean).join(" (") + (p.grade && p.name ? ")" : ""); }).join(", "); };
      var time = C.stamp(start.value) || C.now();
      u.staff = u.staff.filter(function (p) { return off.indexOf(p) < 0; }).concat(on);
      u.crewLog.push({ time: time, off: who(off), on: who(on), by: cad.controller });
      cad.log.push({ time: time, by: cad.controller, text: "Crew change on " + u.callsign + ": " +
        [off.length ? "off " + who(off) : "", on.length ? "on " + who(on) : ""].filter(Boolean).join("; ") });
      cad.log.sort(C.byTime);
      unitForm = null;
      changed();
      renderUnitForm();
      renderUnits();
      renderLog();
    }));
    row.appendChild(btn("Cancel", "ghost small", function () { unitForm = null; renderUnitForm(); }));
    box.appendChild(row);
    box.appendChild(err);
  }

  /* The break or unavailable form, under the board. */
  function renderUnitForm() {
    var box = $("unitPanel"), u = unitForm && C.unitById(cad, unitForm.unit);
    box.innerHTML = "";
    box.hidden = !u;
    if (!u) return;
    if (unitForm.kind === "crew") return renderCrewForm(box, u);
    var isBreak = unitForm.kind === "break";
    box.appendChild(el("h3", "", (isBreak ? "Break: " : "Unavailable: ") + (u.callsign || "Unnamed unit")));
    var g = el("div", "grid"), start = when(C.now(), function () {}), len, end, endField, reason, back;
    g.appendChild(field("Starts", start));
    if (isBreak) {
      end = when("", function () {});
      endField = field("Finishes at", end);
      endField.hidden = true;
      len = pick([["15", "15 minutes"], ["20", "20 minutes"], ["30", "30 minutes"], ["45", "45 minutes"], ["60", "1 hour"],
        ["", "Until a set time"]], "30", function (v) { endField.hidden = !!v; });
      g.appendChild(field("Length", len));
      g.appendChild(endField);
    } else {
      reason = textIn("", function () {}, "e.g. Vehicle defect, restocking");
      back = when("", function () {});
      g.appendChild(field("Reason", reason));
      g.appendChild(field("Expected back (optional)", back));
    }
    box.appendChild(g);
    var err = el("p", "error");
    err.hidden = true;
    var row = el("div", "actions");
    row.appendChild(btn(isBreak ? "Start break" : "Mark unavailable", "primary small", function () {
      var s = C.stamp(start.value) || C.now(), until;
      if (isBreak) {
        until = len.value ? C.addMins(s, +len.value) : C.stamp(end.value);
        if (!until || C.mins(s, until) <= 0) { err.textContent = "Choose when the break finishes."; err.hidden = false; return; }
      } else {
        until = C.stamp(back.value);
        if (!reason.value.trim()) { err.textContent = "Give a reason."; err.hidden = false; return; }
      }
      u.history.push({ kind: unitForm.kind, start: s, until: until, end: "", reason: isBreak ? "" : reason.value.trim() });
      unitForm = null;
      changed();
      renderUnitForm();
    }));
    row.appendChild(btn("Cancel", "ghost small", function () { unitForm = null; renderUnitForm(); }));
    box.appendChild(row);
    box.appendChild(err);
    (isBreak ? len : reason).focus();
  }

  /* ---------------- call list, search and alerts ---------------- */
  function callText(c) {
    return [C.pad3(c.id), C.hhmm(c.received), c.source, c.reportedBy, C.callPlace(cad, c), c.details,
      c.protocol ? c.protocol + " " + C.protocolName(c.protocol) : "", c.category ? "cat " + c.category : ""]
      .concat(c.units.map(function (a) { return [C.callsignOf(cad, a.unit), a.hospital, a.passedTo, a.nhsCad].join(" "); }),
        c.patients.map(function (p) { return p.prf; }), c.log.map(function (e) { return e.text; }), [c.nhs.cad])
      .join(" ").toLowerCase();
  }
  function callItem(c, flagged) {
    var item = el("button", "call-item" + (c.id === current ? " current" : "") + (flagged[c.id] ? " overdue" : ""));
    item.type = "button";
    var top = el("span", "call-top");
    top.appendChild(el("strong", "", C.pad3(c.id)));
    top.appendChild(el("span", "", C.hhmm(c.received)));
    if (c.category) top.appendChild(el("span", "cat cat" + c.category, "Cat " + c.category));
    if (c.duplicateOf) top.appendChild(el("span", "tag", "Duplicate of " + C.pad3(c.duplicateOf)));
    if (c.closed) top.appendChild(el("span", "tag", "Closed " + C.hhmm(c.closed)));
    item.appendChild(top);
    item.appendChild(el("span", "call-what", [c.protocol ? c.protocol + " " + C.protocolName(c.protocol) : "Not coded",
      C.callPlace(cad, c)].filter(Boolean).join("  ·  ")));
    var units = c.units.map(function (a) {
      var step = a.stooddown ? "stood down" : (C.lastStep(a, true) || C.STEPS[0])[1].toLowerCase();
      return C.callsignOf(cad, a.unit) + ": " + step;
    });
    if (units.length) item.appendChild(el("span", "call-units", units.join(", ")));
    item.addEventListener("click", function () { openCall(c.id); });
    return item;
  }
  function renderCalls(list) {
    var q = $("search").value.trim().toLowerCase(), flagged = {};
    list.forEach(function (a) { if (a.call) flagged[a.call] = true; });
    var shown = cad.calls.filter(function (c) { return !q || callText(c).indexOf(q) >= 0; })
      .sort(function (a, b) { return b.id - a.id; });
    var open = shown.filter(function (c) { return !c.closed; }).sort(function (a, b) {
      return (a.category || 9) - (b.category || 9) || C.ms(a.received) - C.ms(b.received) || a.id - b.id;
    });
    var closed = shown.filter(function (c) { return c.closed; });
    $("callList").innerHTML = "";
    $("closedList").innerHTML = "";
    if (!open.length) $("callList").appendChild(el("p", "empty", q ? "No open calls match." : "No open calls."));
    open.forEach(function (c) { $("callList").appendChild(callItem(c, flagged)); });
    closed.forEach(function (c) { $("closedList").appendChild(callItem(c, flagged)); });
    $("closedCount").textContent = closed.length;
    // A search that only matches closed calls opens that list.
    if (q && closed.length && !open.length) $("closedList").parentNode.open = true;
  }
  $("search").addEventListener("input", function () { renderCalls(C.alerts(cad, Date.now())); });

  function logOnCall(id, text) {
    var c = C.callById(cad, id);
    if (!c) return;
    c.log.push({ time: C.now(), text: text, by: cad.controller });
    changed();
    if (current === id) renderCall();
  }
  function renderAlerts(list) {
    var box = $("alerts");
    box.innerHTML = "";
    list.forEach(function (a) {
      var row = el("div", "notice warn alert");
      row.appendChild(el("span", "", a.text));
      if (a.call) row.appendChild(btn("Open call", "ghost small", function () { openCall(a.call); }));
      if (a.kind === "welfare") {
        row.appendChild(btn("Crew OK", "ghost small", function () {
          logOnCall(a.call, "Welfare check: " + C.callsignOf(cad, a.unit) + " OK");
        }, "Welfare check done: " + C.callsignOf(cad, a.unit) + " OK"));
      }
      if (a.kind === "breakover") {
        row.appendChild(btn("Back from break", "ghost small", function () {
          var u = C.unitById(cad, a.unit), p = u && C.openPeriod(u);
          if (p) p.end = C.now();
          changed();
        }));
        if (!beeped[a.key]) { beeped[a.key] = true; beep(); }
      }
      if (a.kind === "tc") row.appendChild(btn("Record count", "ghost small", function () { showTab("tc"); }));
      if (a.kind === "person") row.appendChild(btn("Missing persons", "ghost small", function () { showTab("log"); $("personsCard").scrollIntoView(); }));
      // A category 1 call with no unit, and a missed welfare check, beep once each.
      if (a.loud && !beeped[a.key]) { beeped[a.key] = true; beep(); }
      box.appendChild(row);
    });
  }

  /* The live views: units, calls, alerts and the open-call count. */
  function refresh() {
    var list = C.alerts(cad, Date.now());
    renderBoard();
    renderCalls(list);
    renderAlerts(list);
    $("openCount").textContent = cad.calls.filter(function (c) { return !c.closed; }).length;
    showTcDue();
    renderSummary();
  }
  /* A row of figures for the event so far. */
  function renderSummary() {
    var s = C.stats(cad), all = s.response[0], nowMs = Date.now();
    var free = cad.units.filter(function (u) { return C.unitStatus(cad, u, nowMs).code === "available"; }).length;
    var tiles = [["Calls", s.calls], ["Open", cad.calls.filter(function (c) { return !c.closed; }).length],
      ["Patients", s.patients], ["To hospital", s.toHospital],
      ["Average response", all && all.callToScene ? C.dur(all.callToScene.avg) : "\u2014"],
      ["Units available", free + " of " + cad.units.length]];
    var box = $("summaryStrip");
    box.innerHTML = "";
    tiles.forEach(function (t) {
      var tile = el("div", "tile");
      tile.appendChild(el("b", "", String(t[1])));
      tile.appendChild(el("span", "", t[0]));
      box.appendChild(tile);
    });
  }
  function showTcDue() {
    var due = C.tcDue(cad, Date.now());
    $("tcDue").hidden = !due.length;
    $("tcDue").textContent = C.tcDueText(due);
  }

  /* ---------------- the call sheet ---------------- */
  function openCall(id) {
    current = id;
    if (!$("panel-cad").classList.contains("active")) showTab("cad");
    renderCall();
    refresh();
    if (window.innerWidth < 1000) $("callSheet").scrollIntoView();
  }
  function addCall(walkUp, centre) {
    var id = cad.calls.reduce(function (n, c) { return Math.max(n, c.id); }, 0) + 1, c = C.newCall(id, C.now(), cad.controller);
    if (walkUp) {
      c.source = "Walk-up";
      c.place = centre || "";
      var p = C.placeById(cad, c.place);   // the centre's own grid ref and what3words, as picking it on a call does
      if (p) { c.grid = p.grid; c.w3w = p.w3w; }
      c.patients.push({ age: "", sex: "", prf: "", outcome: "" });
    }
    cad.calls.push(c);
    current = id;
    changed();
    renderCall();
    (walkUp ? $("callSheet").querySelector(".patient-row input") : $("callSheet").querySelector("select")).focus();
  }
  $("newCallBtn").addEventListener("click", function () { addCall(false); });
  /* A walk-up button for each treatment centre, or one when none is set up. */
  function renderWalkUps() {
    var box = $("walkUps"), centres = C.tcCentres(cad);
    box.innerHTML = "";
    (centres.length ? centres : [null]).forEach(function (p) {
      box.appendChild(btn("+ Walk-up" + (p ? ": " + p.name : ""), "ghost", function () { addCall(true, p && p.id); },
        "New walk-up" + (p ? " at " + p.name : "")));
    });
  }

  function section(box, title) {
    var s = el("div", "call-section");
    s.appendChild(el("h3", "", title));
    box.appendChild(s);
    return s;
  }

  /* what3words: the address, a map link, and suggestions when there is a key. */
  function w3wField(c) {
    var wrap = el("div", "w3w"), label = el("label", "field");
    label.appendChild(el("span", "", "what3words"));
    var input = el("input");
    input.type = "text";
    input.value = c.w3w ? "///" + c.w3w : "";
    input.placeholder = "///filled.count.soap";
    input.autocomplete = "off";
    input.spellcheck = false;
    label.appendChild(input);
    wrap.appendChild(label);
    var help = el("div", "w3w-help"), timer = null, asked = 0;
    wrap.appendChild(help);
    function show() {
      help.innerHTML = "";
      if (c.w3w && C.isW3w(c.w3w)) {
        var a = el("a", "w3w-link", "Show ///" + c.w3w + " on the map");
        a.href = "https://what3words.com/" + encodeURIComponent(c.w3w);
        a.target = "_blank";
        a.rel = "noopener";
        help.appendChild(a);
      } else if (c.w3w) {
        help.appendChild(el("span", "echo warn", "Three words with dots, e.g. ///filled.count.soap"));
      }
    }
    function suggest(text, key) {
      var mine = ++asked;
      fetch("https://api.what3words.com/v3/autosuggest?input=" + encodeURIComponent(text) + "&n-results=3&key=" +
        encodeURIComponent(key))
        .then(function (r) { if (!r.ok) throw new Error("what3words said " + r.status); return r.json(); })
        .then(function (d) {
          if (mine !== asked) return;   // a newer request is on its way
          var list = (isObj(d) && Array.isArray(d.suggestions) ? d.suggestions : []).filter(function (s) {
            return isObj(s) && typeof s.words === "string" && C.isW3w(s.words);
          });
          show();
          if (!list.length) {
            help.appendChild(el("span", "echo warn", "No what3words address like that: check the words with the caller."));
            return;
          }
          var box = el("div", "w3w-suggest");
          box.appendChild(el("span", "echo", "Did you mean:"));
          list.forEach(function (s) {
            box.appendChild(btn("///" + s.words + (str(s.nearestPlace) ? ", near " + s.nearestPlace : ""), "ghost small",
              function () {
                c.w3w = C.w3w(s.words);
                input.value = "///" + c.w3w;
                changed();
                show();
              }));
          });
          help.appendChild(box);
        })
        .catch(function () {
          if (mine !== asked) return;
          show();
          help.appendChild(el("span", "echo warn", "Couldn't check the address: no internet, or what3words refused the key."));
        });
    }
    input.addEventListener("input", function () {
      c.w3w = C.w3w(input.value);
      changed();
      show();
      clearTimeout(timer);
      asked++;   // any answer still on its way is now out of date
      var key = w3wKey(), text = c.w3w;
      if (key && /^[^.\s]+\.[^.\s]+\.[^.\s]+$/.test(text)) timer = setTimeout(function () { suggest(text, key); }, 350);
    });
    show();
    return wrap;
  }

  /* The site map, full screen: the square clicked becomes the call's grid ref. */
  function pickOnMap(c) {
    $("mapPickImg").src = siteMap.src;
    $("mapPick").hidden = false;
    $("mapPickImg").onclick = function (e) {
      var r = $("mapPickImg").getBoundingClientRect(), g = cad.settings.mapGrid;
      var col = Math.min(g.cols - 1, Math.floor((e.clientX - r.left) / r.width * g.cols));
      var row = Math.min(g.rows - 1, Math.floor((e.clientY - r.top) / r.height * g.rows));
      c.grid = String.fromCharCode(65 + Math.max(0, col)) + (Math.max(0, row) + 1);
      $("mapPick").hidden = true;
      changed();
      renderCall();
    };
  }
  $("mapPickClose").addEventListener("click", function () { $("mapPick").hidden = true; });

  function closeProblem(c) {
    var busy = c.units.filter(function (a) { return !C.finished(a); }).map(function (a) { return C.callsignOf(cad, a.unit); });
    if (busy.length) return "Clear or stand down " + busy.join(", ") + " first.";
    if (c.duplicateOf) return "";
    if (c.patients.some(function (p) { return !p.outcome; })) return "Give each patient an outcome.";
    if (!c.patients.length && !c.outcome) return "Choose an outcome, or add the patients.";
    return "";
  }

  function assign(c, unitId) {
    var u = C.unitById(cad, unitId);
    if (!u) return;
    var st = C.unitStatus(cad, u, Date.now()), p = C.openPeriod(u);
    if (st.call && !confirm(u.callsign + " is on call " + C.pad3(st.call) + ". Assign it to this call as well?")) return;
    var what = { "break": ["on break", "break"], offduty: ["off duty", "time off duty"] }[p && p.kind] ||
      ["unavailable", "unavailable time"];
    if (!st.call && p && !confirm(u.callsign + " is " + what[0] + ". Assign it anyway? That ends its " + what[1] + " now.")) return;
    if (!st.call && p) p.end = C.now();
    c.units.push(C.newAssignment(u.id, C.now()));
    changed();
    renderCall();
  }

  /* A step's time as a short chip; clicking the time opens a box to correct it. */
  function stampChip(label, value, day, onChange, cls) {
    var chip = el("span", "step done" + (cls ? " " + cls : ""));
    chip.appendChild(el("span", "", label));
    var shown = (value.slice(0, 10) === day ? "" : value.slice(8, 10) + "/" + value.slice(5, 7) + " ") + C.hhmm(value);
    var time = btn(shown, "chip-time", function () {
      var input = when(value, onChange);
      input.setAttribute("aria-label", label + " time");
      chip.replaceChild(input, time);
      input.focus();
    }, "Correct the " + label.toLowerCase() + " time, " + shown);
    chip.appendChild(time);
    return chip;
  }

  function renderAssignment(c, a, sec) {
    var u = C.unitById(cad, a.unit) || { id: "", callsign: "Removed unit", type: "", reg: "", at: "" };
    var box = el("div", "assignment"), head = el("div", "assign-head");
    head.appendChild(el("strong", "", u.callsign || "Unnamed unit"));
    head.appendChild(el("span", "echo", [u.type, u.reg].filter(Boolean).join(" · ")));
    box.appendChild(head);
    var done = C.finished(a), steps = el("div", "steps");
    var back = pick([["", "Stays where it is"]].concat(placeOptions()), u.at || "");
    C.STEPS.forEach(function (s) {
      if (a[s[0]]) {
        steps.appendChild(stampChip(s[1], a[s[0]], c.received.slice(0, 10), function (v) {
          if (!v && s[0] === "assigned") return;   // the assignment itself keeps a time; emptying another undoes it
          a[s[0]] = v;
          changed();
          renderCall();
        }));
      } else if (!done) {
        steps.appendChild(btn(s[1], "ghost small step-btn", function () {
          a[s[0]] = C.now();
          if (s[0] === "clear" && back.value) u.at = back.value;
          changed();
          renderCall();
        }, s[1] + ": " + u.callsign));
      }
    });
    if (a.stooddown) {
      steps.appendChild(stampChip("Stood down", a.stooddown, c.received.slice(0, 10), function (v) {
        a.stooddown = v;
        changed();
        renderCall();
      }, "stood"));
    } else if (!done) {
      steps.appendChild(btn("Stood down", "ghost small step-btn stand", function () {
        a.stooddown = C.now();
        if (back.value) u.at = back.value;
        changed();
        renderCall();
      }, "Stood down: " + u.callsign));
    }
    box.appendChild(steps);
    if (!done) {
      var backRow = el("div", "back-row");
      backRow.appendChild(field("When clear or stood down, goes to", back));
      if (!a.enroute && !a.onscene) {
        backRow.appendChild(btn("Remove from call", "ghost small", function () {
          c.units.splice(c.units.indexOf(a), 1);
          changed();
          renderCall();
        }, "Remove " + u.callsign + " from this call"));
      }
      box.appendChild(backRow);
    }
    if (a.moving) {
      var dest = el("div", "dest"), opts = [["", "Choose destination"]].concat(placeOptions());
      if (u.type === "Ambulance" || a.dest === "hospital") opts.push(["hospital", "Hospital"]);
      dest.appendChild(field("Moving patient to", pick(opts, a.dest, function (v) { a.dest = v; changed(); renderCall(); })));
      if (a.dest === "hospital") {
        var warn = el("p", "hosp-warn");
        var showWarn = function () { warn.textContent = C.hospitalWarning(cad, a.hospital); warn.hidden = !warn.textContent; };
        var hosp = textIn(a.hospital, function (v) { a.hospital = v; changed(); showWarn(); }, "e.g. Royal Infirmary");
        hosp.setAttribute("list", "hospitalList");
        dest.appendChild(field("Hospital", hosp));
        showWarn();
        dest.appendChild(warn);
        dest.appendChild(tick("Blue light / pre-alert", a.blue, function (v) { a.blue = v; changed(); renderCall(); }));
        if (a.blue) {
          var pre = el("div", "grid prealert");
          pre.appendChild(el("p", "hint span-all", "Pre-alert (ATMIST)"));
          C.ATMIST.forEach(function (f) {
            pre.appendChild(field(f[1], textIn(a.atmist[f[0]], function (v) { a.atmist[f[0]] = v; changed(); })));
          });
          pre.appendChild(field("ETA", textIn(a.eta, function (v) { a.eta = v; changed(); }, "e.g. 14:40 or 15 min")));
          pre.appendChild(field("Passed to", textIn(a.passedTo, function (v) { a.passedTo = v; changed(); },
            "e.g. ED nurse in charge")));
          pre.appendChild(field("Passed", pick([["", "Choose"], ["hospital", "Direct to the hospital"],
            ["nhs", "Via NHS ambulance control"]], a.via, function (v) { a.via = v; changed(); renderCall(); })));
          if (a.via === "nhs") {
            pre.appendChild(field("NHS CAD number", textIn(a.nhsCad, function (v) { a.nhsCad = v; changed(); })));
          }
          dest.appendChild(pre);
        }
      }
      box.appendChild(dest);
    }
    sec.appendChild(box);
  }

  function renderCall() {
    var c = C.callById(cad, current), box = $("callSheet");
    box.innerHTML = "";
    $("callEmpty").hidden = !!c;
    box.hidden = !c;
    if (!c) return;
    var set = function (f) { return function (v) { c[f] = v; changed(); }; };

    var head = el("div", "call-head");
    head.appendChild(el("h2", "", "Call " + C.pad3(c.id)));
    head.appendChild(el("span", "badge " + (c.closed ? "closed" : "open"),
      c.closed ? "Closed " + C.hhmm(c.closed) : c.duplicateOf ? "Duplicate" : "Open"));
    head.appendChild(btn("Call log (PDF)", "ghost small", function () {
      window.CadPDF.call(cad, c).save("Call-" + C.pad3(c.id) + "-" + fileBase() + ".pdf");
    }));
    box.appendChild(head);

    var g = el("div", "grid");
    g.appendChild(field("Received", when(c.received, function (v) { if (v) { c.received = v; changed(); } })));
    g.appendChild(field("Controller", textIn(c.controller, set("controller"))));
    g.appendChild(field("How it came in", pick([["", "Not recorded"]].concat(C.SOURCES.map(function (s) { return [s, s]; })),
      c.source, set("source"))));
    g.appendChild(field("Reported by", textIn(c.reportedBy, set("reportedBy"), "e.g. Steward at gate B")));
    box.appendChild(g);

    var loc = section(box, "Location"), lg = el("div", "grid");
    lg.appendChild(field("Point of interest", pick([["", "None chosen"]].concat(placeOptions()), c.place, function (v) {
      // The location's own grid ref and what3words fill in, unless the call already has its own.
      var p = C.placeById(cad, v);
      c.place = v;
      if (p && p.grid && !c.grid) c.grid = p.grid;
      if (p && p.w3w && !c.w3w) c.w3w = p.w3w;
      changed();
      renderCall();
    })));
    lg.appendChild(field("Description", textIn(c.locText, set("locText"), "e.g. Behind the main stage bar")));
    lg.appendChild(w3wField(c));
    var gridBox = el("div", "grid-ref");
    gridBox.appendChild(field("Site map grid ref", textIn(c.grid, set("grid"), "e.g. C4")));
    if (siteMap && cad.settings.mapGrid.cols && cad.settings.mapGrid.rows) {
      gridBox.appendChild(btn("Pick on map", "ghost small", function () { pickOnMap(c); }, "Pick the grid ref on the site map"));
    }
    lg.appendChild(gridBox);
    loc.appendChild(lg);

    var what = section(box, "What"), wg = el("div", "grid");
    wg.appendChild(field("MPDS protocol", pick([["0", "Not coded"]].concat(C.MPDS.map(function (p) {
      return [String(p[0]), p[0] + "  " + p[1]];
    })), String(c.protocol), function (v) { c.protocol = +v; changed(); })));
    wg.appendChild(field("Category", pick([["0", "No category"]].concat(C.CATEGORIES.map(function (k) {
      return [String(k[0]), "Category " + k[0] + ": " + k[1]];
    })), String(c.category), function (v) {
      var was = c.category;
      c.category = +v;
      if (was && was !== c.category) {
        c.log.push({ time: C.now(), by: cad.controller, text: c.category ? "Category changed from " + was + " to " + c.category
          : "Category " + was + " removed" });
      }
      changed();
      if (was) renderCall();
    })));
    wg.appendChild(field("Details", area(c.details, set("details"), "What the caller says"), "span2"));
    what.appendChild(wg);
    var flags = el("div", "flag-row");
    C.FLAGS.forEach(function (f) {
      flags.appendChild(tick(f[1], c.flags[f[0]], function (v) {
        c.flags[f[0]] = v;
        changed();
        if (f[0] === "police") renderCall();
      }));
    });
    what.appendChild(flags);
    if (c.flags.police) {
      what.appendChild(field("Police / security reference", textIn(c.policeRef, set("policeRef"), "e.g. police log 0412"),
        "dup-field"));
    }
    var others = cad.calls.filter(function (o) { return o.id !== c.id && !o.duplicateOf; });
    var dup = field("Duplicate of", pick([["0", "Not a duplicate"]].concat(others.map(function (o) {
      return [String(o.id), "Call " + C.pad3(o.id) + " (" + C.hhmm(o.received) + ")"];
    })), String(c.duplicateOf), function (v) { c.duplicateOf = +v; changed(); renderCall(); }), "dup-field");
    what.appendChild(dup);
    if (c.duplicateOf) {
      what.appendChild(el("p", "hint", "A second report of call " + C.pad3(c.duplicateOf) +
        ": kept in the call logs, left out of the report's figures."));
    }

    var pat = section(box, "Patients");
    if (!c.patients.length) pat.appendChild(el("p", "empty", "No patients recorded."));
    c.patients.forEach(function (p, i) {
      var row = el("div", "patient-row");
      row.appendChild(field("Age", textIn(p.age, function (v) { p.age = v; changed(); }, "e.g. 34")));
      row.appendChild(field("Sex", pick([["", "Not recorded"]].concat(C.SEXES.map(function (s) { return [s, s]; })), p.sex,
        function (v) { p.sex = v; changed(); })));
      row.appendChild(field("PRF number", textIn(p.prf, function (v) { p.prf = v; changed(); })));
      row.appendChild(field("Outcome", pick([["", "Not yet"]].concat(C.OUTCOMES.map(function (o) { return [o, o]; })),
        p.outcome, function (v) { p.outcome = v; changed(); })));
      var removeBtn = btn("Remove", "ghost small", function () {
        c.patients.splice(i, 1);
        changed();
        renderCall();
      }, "Remove patient " + (i + 1));
      row.appendChild(removeBtn);
      row.appendChild(field("Presentation", pick([["", "Not recorded"]].concat(C.PRESENTATIONS.map(function (t) { return [t, t]; })),
        p.type, function (v) { p.type = v; changed(); }), "ptype"));
      var alc = tick("Alcohol or drugs involved", p.alcohol, function (v) { p.alcohol = v; changed(); });
      alc.classList.add("palc");
      row.appendChild(alc);
      pat.appendChild(row);
    });
    pat.appendChild(btn("+ Add patient", "ghost small", function () {
      c.patients.push({ age: "", sex: "", prf: "", outcome: "" });
      changed();
      renderCall();
    }));

    var un = section(box, "Units"), add = el("div", "assign-row");
    var free = cad.units.filter(function (u) {
      return !c.units.some(function (a) { return a.unit === u.id && !C.finished(a); });
    });
    var choose = pick([["", free.length ? "Choose a unit" : "No units free"]].concat(free.map(function (u) {
      return [u.id, (u.callsign || "Unnamed unit") + ": " + C.unitStatus(cad, u, Date.now()).label.toLowerCase()];
    })), "");
    choose.setAttribute("aria-label", "Unit to assign");
    add.appendChild(choose);
    add.appendChild(btn("Assign", "primary small", function () { if (choose.value) assign(c, choose.value); }));
    un.appendChild(add);
    c.units.forEach(function (a) { renderAssignment(c, a, un); });

    var nhs = section(box, "NHS ambulance");
    if (!c.nhs.requested) {
      nhs.appendChild(btn("NHS ambulance requested", "ghost small", function () {
        c.nhs.requested = C.now();
        changed();
        renderCall();
      }));
    } else {
      var ng = el("div", "grid");
      ng.appendChild(field("Requested", when(c.nhs.requested, function (v) { c.nhs.requested = v; changed(); renderCall(); })));
      ng.appendChild(field("NHS CAD number", textIn(c.nhs.cad, function (v) { c.nhs.cad = v; changed(); })));
      ng.appendChild(field("Category given", pick([["0", "Not given"]].concat(C.CATEGORIES.map(function (k) {
        return [String(k[0]), "Category " + k[0]];
      })), String(c.nhs.category), function (v) { c.nhs.category = +v; changed(); })));
      [["arrived", "NHS crew arrived"], ["handover", "Handed over"]].forEach(function (f) {
        if (c.nhs[f[0]]) {
          ng.appendChild(field(f[1], when(c.nhs[f[0]], function (v) { c.nhs[f[0]] = v; changed(); renderCall(); })));
        } else {
          var cell = el("div", "field");
          cell.appendChild(el("span", "", f[1]));
          cell.appendChild(btn("Now", "ghost small now-btn", function () { c.nhs[f[0]] = C.now(); changed(); renderCall(); }, f[1]));
          ng.appendChild(cell);
        }
      });
      nhs.appendChild(ng);
    }

    var lg2 = section(box, "Call log"), list = el("div", "log-list");
    if (!c.log.length) list.appendChild(el("p", "empty", "No updates yet."));
    c.log.forEach(function (e) { list.appendChild(logLine(e)); });
    lg2.appendChild(list);
    if (cad.settings.phrases.length) {
      var quick = el("div", "phrases");
      cad.settings.phrases.forEach(function (p) {
        quick.appendChild(btn(p, "ghost small", function () {
          c.log.push({ time: C.now(), text: p, by: cad.controller });
          changed();
          renderCall();
        }, "Log: " + p));
      });
      lg2.appendChild(quick);
    }
    var addRow = el("div", "add-row"), entry = textIn("", function () {}, "Add an update, e.g. Patient alert and talking");
    entry.id = "callLogInput";
    entry.setAttribute("aria-label", "Call log entry");
    function addEntry() {
      var t = entry.value.trim();
      if (!t) return;
      c.log.push({ time: C.now(), text: t, by: cad.controller });
      changed();
      renderCall();
      $("callLogInput").focus();
    }
    entry.addEventListener("keydown", function (e) { if (e.key === "Enter") addEntry(); });
    addRow.appendChild(entry);
    addRow.appendChild(btn("Add", "primary small", addEntry, "Add to call log"));
    lg2.appendChild(addRow);

    var cl = section(box, c.closed ? "Closed" : "Close the call");
    if (c.closed) {
      cl.appendChild(el("p", "", "Closed at " + C.ukStamp(c.closed) + "."));
      cl.appendChild(btn("Reopen call", "ghost small", function () { c.closed = ""; changed(); renderCall(); }));
    } else {
      if (!c.patients.length && !c.duplicateOf) {
        cl.appendChild(field("Outcome (no patient on this call)", pick([["", "Choose"]].concat(C.OUTCOMES.map(function (o) {
          return [o, o];
        })), c.outcome, set("outcome"))));
      }
      var err = el("p", "error");
      err.hidden = true;
      var actions = el("div", "actions");
      actions.appendChild(btn("Close call", "primary", function () {
        var problem = closeProblem(c);
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        c.closed = C.now();
        changed();
        renderCall();
      }));
      cl.appendChild(actions);
      cl.appendChild(err);
    }
  }

  function logLine(e) {
    var line = el("div", "log-line");
    line.appendChild(el("time", "", C.hhmm(e.time)));
    line.appendChild(el("span", "", e.text));
    line.appendChild(el("span", "by", e.by));
    return line;
  }

  /* ---------------- controller on duty ---------------- */
  $("controller").addEventListener("change", function () {
    var name = $("controller").value.trim();
    if (name === cad.controller) return;
    // A change from one controller to another is a handover: a note for the log, if they want one.
    var note = cad.controller && name ? (window.prompt("Handover from " + cad.controller + " to " + name +
      ". A handover note for the control log (optional):", "") || "").trim() : "";
    cad.controller = name;
    if (name) cad.log.push({ time: C.now(), text: "Controller on duty: " + name + (note ? ". Handover: " + note : ""), by: name });
    changed();
    renderLog();
  });

  /* ================= SITREP ================= */
  function makeSitrep() {
    var mins = +$("sitrepPeriod").value;
    $("sitrepText").value = C.sitrep(cad, Date.now(), mins ? Date.now() - mins * 60000 : 0);
  }
  $("sitrepBtn").addEventListener("click", function () {
    $("sitrepPanel").hidden = !$("sitrepPanel").hidden;
    $("sitrepResult").hidden = true;
    if (!$("sitrepPanel").hidden) makeSitrep();
  });
  $("sitrepPeriod").addEventListener("change", makeSitrep);
  $("sitrepClose").addEventListener("click", function () { $("sitrepPanel").hidden = true; });
  $("sitrepCopy").addEventListener("click", function () {
    makeSitrep();
    var done = function () { message("sitrepResult", "good", "Copied: paste it into a message, or read it over the radio."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText($("sitrepText").value).then(done, function () {
        $("sitrepText").select();
        message("sitrepResult", "info", "Selected: press Ctrl+C (or Cmd+C) to copy.");
      });
    } else {
      $("sitrepText").select();
      message("sitrepResult", "info", "Selected: press Ctrl+C (or Cmd+C) to copy.");
    }
  });
  $("sitrepLog").addEventListener("click", function () {
    makeSitrep();
    cad.log.push({ time: C.now(), by: cad.controller, text: $("sitrepText").value.split("\n").join(" ") });
    changed();
    renderLog();
    message("sitrepResult", "good", "Added to the control log.");
  });

  /* ================= TREATMENT CENTRE ================= */
  function renderTc() {
    // With treatment centres set up, each count is for one of them: the first one due is picked.
    var centres = C.tcCentres(cad), due = C.tcDue(cad, Date.now()), pickEl = $("tcPlace"), was = pickEl.value;
    pickEl.innerHTML = "";
    centres.forEach(function (p) {
      var opt = el("option", "", p.name);
      opt.value = p.id;
      pickEl.appendChild(opt);
    });
    var first = centres.filter(function (p) { return due.indexOf(p.name) >= 0; })[0];
    pickEl.value = centres.some(function (p) { return p.id === was; }) ? was : first ? first.id : centres.length ? centres[0].id : "";
    $("tcPlaceField").hidden = !centres.length;
    var body = $("tcBody");
    body.innerHTML = "";
    $("tcEmpty").hidden = cad.tc.length > 0;
    $("tcTable").hidden = !cad.tc.length;
    cad.tc.slice().reverse().forEach(function (t) {
      var tr = el("tr");
      tr.appendChild(el("td", "", C.ukStamp(t.time)));
      tr.appendChild(el("td", "", C.placeName(cad, t.place)));
      tr.appendChild(el("td", "num", String(t.count)));
      tr.appendChild(el("td", "", t.notes));
      tr.appendChild(el("td", "", t.by));
      var act = el("td");
      act.appendChild(btn("Delete", "ghost small", function () {
        if (!confirm("Delete the count of " + t.count + " at " + C.hhmm(t.time) +
          (t.place ? " for " + C.placeName(cad, t.place) : "") + "?")) return;
        cad.tc.splice(cad.tc.indexOf(t), 1);
        changed();
        renderTc();
      }, "Delete the count at " + C.hhmm(t.time)));
      tr.appendChild(act);
      body.appendChild(tr);
    });
    showTcDue();
  }
  $("tcAdd").addEventListener("click", function () {
    var n = Number($("tcCount").value);
    if ($("tcCount").value === "" || !(n >= 0) || Math.floor(n) !== n) {
      message("tcResult", "bad", "Enter how many patients are in the treatment centre now.");
      return;
    }
    var t = { time: C.stamp($("tcTime").value) || C.now(), place: C.tcCentres(cad).length ? $("tcPlace").value : "",
      count: n, notes: $("tcNotes").value.trim(), by: cad.controller };
    cad.tc.push(t);
    cad.tc.sort(C.byTime);
    $("tcCount").value = "";
    $("tcNotes").value = "";
    $("tcTime").value = C.now();
    $("tcPlace").value = "";   // so the next centre due is picked
    changed();
    renderTc();
    message("tcResult", "good", "Recorded " + n + (n === 1 ? " patient" : " patients") +
      (t.place ? " in " + C.placeName(cad, t.place) : "") + " at " + C.hhmm(t.time) + ".");
  });

  /* ================= CONTROL LOG AND METHANE ================= */
  function renderLog() {
    var box = $("controlLog");
    box.innerHTML = "";
    if (!cad.log.length) box.appendChild(el("p", "empty", "No entries yet."));
    cad.log.slice().reverse().forEach(function (e) {
      var line = logLine(e);
      line.firstChild.textContent = C.ukStamp(e.time);
      box.appendChild(line);
    });
  }
  function addLog() {
    var text = $("logText").value.trim();
    if (!text) { message("logResult", "bad", "Write the entry first."); return; }
    cad.log.push({ time: C.stamp($("logTime").value) || C.now(), text: text, by: cad.controller });
    cad.log.sort(C.byTime);
    $("logText").value = "";
    $("logTime").value = C.now();
    $("logResult").hidden = true;
    changed();
    renderLog();
  }
  $("logAdd").addEventListener("click", addLog);
  $("logText").addEventListener("keydown", function (e) { if (e.key === "Enter") addLog(); });

  var MT = C.METHANE.map(function (f) { return f[0]; });
  function openMethane() {
    showTab("log");
    $("methaneForm").hidden = false;
    $("mtTime").value = C.now();
    MT.forEach(function (k) { if (k !== "m") $("mt-" + k).value = ""; });
    $("mt-m").value = "Declared";
    var last = cad.casualties[cad.casualties.length - 1];
    if (last) $("mt-n").value = casualtyText(last) + " (count at " + C.hhmm(last.time) + ")";
    $("mtPassed").value = "";
    $("methaneError").hidden = true;
    $("methaneCard").scrollIntoView();
    $("mt-m").focus();
  }
  $("methaneBtn").addEventListener("click", openMethane);
  $("methaneNew").addEventListener("click", openMethane);
  $("methaneCancel").addEventListener("click", function () { $("methaneForm").hidden = true; });
  $("methaneSave").addEventListener("click", function () {
    if (!$("mt-e").value.trim()) {
      $("methaneError").textContent = "Give the exact location.";
      $("methaneError").hidden = false;
      return;
    }
    var m = { time: C.stamp($("mtTime").value) || C.now(), by: cad.controller, passedTo: $("mtPassed").value.trim() };
    MT.forEach(function (k) { m[k] = $("mt-" + k).value.trim(); });
    cad.methane.push(m);
    cad.methane.sort(C.byTime);
    cad.log.push({ time: m.time, by: cad.controller, text: "METHANE message: major incident " + m.m.toLowerCase() + " at " +
      m.e + (m.passedTo ? ". Passed to " + m.passedTo : "") });
    cad.log.sort(C.byTime);
    $("methaneForm").hidden = true;
    changed();
    renderLog();
    renderMethane();
  });
  function renderMethane() {
    var box = $("methaneList");
    box.innerHTML = "";
    cad.methane.slice().reverse().forEach(function (m, i) {
      var row = el("div", "methane-row");
      row.appendChild(el("strong", "", C.ukStamp(m.time)));
      row.appendChild(el("span", "", "Major incident " + m.m.toLowerCase() + ": " + m.e));
      row.appendChild(btn("PDF", "ghost small", function () {
        window.CadPDF.methane(cad, m).save("METHANE-" + m.time.replace(/[^0-9]/g, "").slice(0, 12) + ".pdf");
      }, "Download the METHANE message of " + C.ukStamp(m.time)));
      box.appendChild(row);
    });
  }

  /* ================= SITE MAP ================= */
  // Kept apart from the CAD, so the large image is not rewritten with every change; exports carry it.
  var MAP_KEY = "event-cad/site-map";
  var siteMap = null;
  function cleanMap(m) {
    return isObj(m) && typeof m.src === "string" && /^data:image\/(jpeg|png);base64,/.test(m.src) && +m.w > 0 && +m.h > 0
      ? { src: m.src, w: +m.w, h: +m.h } : null;
  }
  function loadMap() {
    try { siteMap = cleanMap(JSON.parse(localStorage.getItem(MAP_KEY))); } catch (e) { siteMap = null; }
  }
  function storeMap(m) {
    try {
      if (m) localStorage.setItem(MAP_KEY, JSON.stringify(m)); else localStorage.removeItem(MAP_KEY);
    } catch (e) { return false; }
    siteMap = m;
    renderMap();
    backupSoon();
    return true;
  }
  function takeMap(parsed) { var m = cleanMap(parsed.siteMap); if (m) storeMap(m); }
  function renderMap() {
    $("mapPreview").innerHTML = "";
    $("mapRemove").hidden = !siteMap;
    $("mapCard").hidden = !siteMap;
    if (!siteMap) return;
    var img = el("img");
    img.src = siteMap.src;
    img.alt = "Site map";
    $("mapPreview").appendChild(img);
    $("mapImg").src = siteMap.src;
  }
  $("mapBtn").addEventListener("click", function () { $("mapFile").click(); });
  $("mapFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { message("mapResult", "bad", "That file could not be read."); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { message("mapResult", "bad", "That is not an image this browser can show. Use a JPEG or PNG."); };
      img.onload = function () {
        // Shrunk to a JPEG: big enough to read grid squares, small enough for the browser's storage.
        var scale = Math.min(1, 2400 / Math.max(img.width, img.height));
        var canvas = el("canvas"), g = canvas.getContext("2d");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        g.fillStyle = "#fff";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        var m = { src: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
        if (storeMap(m)) message("mapResult", "good", "Added the site map. It shows on the CAD tab and prints in the paper fallback pack.");
        else message("mapResult", "bad", "This browser has no room to store that map. Try a smaller image.");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $("mapRemove").addEventListener("click", function () {
    if (confirm("Remove the site map?")) storeMap(null);
    $("mapResult").hidden = true;
  });
  // Click the map to see it full screen; click again, or press Escape, to close.
  $("mapImg").addEventListener("click", function () { $("mapCard").classList.toggle("zoomed"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $("mapCard").classList.remove("zoomed"); });

  /* ================= LIVE BACKUP FILE ================= */
  // Chrome and Edge can keep writing to one file the user picked: a copy of the CAD after every change.
  var backup = { handle: null, stored: null, writing: false, again: false, timer: null, last: "", failed: false };
  var canBackup = typeof window.showSaveFilePicker === "function";
  function exportData() { return Object.assign({ format: C.FORMAT, version: 1 }, cad, { siteMap: siteMap }); }

  /* The chosen file is remembered in IndexedDB, so a reload only needs a click to carry on. */
  function handles(mode, work) {
    return new Promise(function (resolve) {
      try {
        var open = indexedDB.open("event-cad", 1);
        open.onupgradeneeded = function () { open.result.createObjectStore("files"); };
        open.onerror = function () { resolve(null); };
        open.onsuccess = function () {
          try {
            var tx = open.result.transaction("files", mode), req = work(tx.objectStore("files"));
            tx.oncomplete = function () { resolve(req ? req.result : null); };
            tx.onerror = tx.onabort = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }
  function backupNow() {
    if (!backup.handle) return;
    if (backup.writing) { backup.again = true; return; }
    backup.writing = true;
    var text = JSON.stringify(exportData(), null, 1);
    backup.handle.createWritable().then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    }).then(function () {
      backup.last = C.now();
      backup.failed = false;
    }, function () {
      backup.failed = true;
    }).then(function () {
      backup.writing = false;
      showBackup();
      if (backup.again) { backup.again = false; backupNow(); }
    });
  }
  function backupSoon() {
    if (!backup.handle) return;
    clearTimeout(backup.timer);
    backup.timer = setTimeout(backupNow, 1000);
  }
  function useHandle(h) {
    backup.handle = h;
    backup.stored = null;
    showBackup();
    backupNow();
  }
  function startBackup() {
    if (!canBackup) return showBackup();
    handles("readonly", function (s) { return s.get("backup"); }).then(function (h) {
      if (!h || typeof h.queryPermission !== "function") return showBackup();
      h.queryPermission({ mode: "readwrite" }).then(function (state) {
        if (state === "granted") useHandle(h);
        else { backup.stored = h; showBackup(); }
      }, showBackup);
    });
  }
  function showBackup() {
    var line = $("backupLine"), status = $("backupStatus");
    var name = (backup.handle || backup.stored || {}).name || "";
    $("backupChoose").hidden = !canBackup;
    $("backupReconnect").hidden = !(backup.stored || (backup.handle && backup.failed));
    $("backupStop").hidden = !(backup.handle || backup.stored);
    var text, kind;
    if (!canBackup) {
      text = "This browser can't keep a live backup file. Use Chrome or Edge on a laptop, or export the CAD often.";
      kind = "info";
    } else if (backup.handle && backup.failed) {
      text = "The live backup to " + name + " stopped working. Reconnect it, or choose the file again.";
      kind = "bad";
    } else if (backup.handle) {
      text = "Live backup on: " + name + (backup.last ? ", saved " + C.hhmm(backup.last) : "") + ".";
      kind = "good";
    } else if (backup.stored) {
      text = "The live backup to " + name + " is paused until you reconnect it.";
      kind = "warn";
    } else {
      text = "No live backup file yet: everything is only in this browser.";
      kind = "warn";
    }
    status.className = "notice " + kind;
    status.textContent = text;
    line.className = "backup-line " + kind;
    line.textContent = text;
    line.hidden = !canBackup;
  }
  $("backupChoose").addEventListener("click", function () {
    window.showSaveFilePicker({ suggestedName: "CAD-live-backup-" + (slug(cad.event.name) || "event") + ".json",
      types: [{ description: "Event CAD backup", accept: { "application/json": [".json"] } }] })
      .then(function (h) {
        handles("readwrite", function (s) { return s.put(h, "backup"); });
        useHandle(h);
      }, function () { /* the picker was closed */ });
  });
  $("backupReconnect").addEventListener("click", function () {
    var h = backup.stored || backup.handle;
    h.requestPermission({ mode: "readwrite" }).then(function (state) {
      if (state === "granted") { backup.failed = false; useHandle(h); }
    });
  });
  $("backupStop").addEventListener("click", function () {
    if (!confirm("Stop the live backup? The file already saved is kept.")) return;
    backup.handle = null;
    backup.stored = null;
    handles("readwrite", function (s) { return s.delete("backup"); });
    showBackup();
  });

  /* ================= ATTENDANCE AND WEATHER ================= */
  function renderConditions() {
    var body = $("cdBody");
    body.innerHTML = "";
    $("cdTable").hidden = !cad.conditions.length;
    cad.conditions.slice().reverse().forEach(function (h) {
      var tr = el("tr");
      [C.ukStamp(h.time), h.crowd ? h.crowd.toLocaleString("en-GB") : "", h.temp ? h.temp + "\u00b0C" : "", h.weather, h.by]
        .forEach(function (t) { tr.appendChild(el("td", "", t)); });
      body.appendChild(tr);
    });
  }
  $("cdAdd").addEventListener("click", function () {
    var crowd = parseInt($("cdCrowd").value, 10), h = { time: C.stamp($("cdTime").value) || C.now(),
      crowd: crowd >= 0 ? crowd : 0, temp: $("cdTemp").value.trim(), weather: $("cdWeather").value.trim(), by: cad.controller };
    if (!h.crowd && !h.temp && !h.weather) { message("cdResult", "bad", "Enter the people on site, the temperature or the weather."); return; }
    cad.conditions.push(h);
    cad.conditions.sort(C.byTime);
    ["cdCrowd", "cdTemp", "cdWeather"].forEach(function (id) { $(id).value = ""; });
    $("cdTime").value = C.now();
    changed();
    renderConditions();
    message("cdResult", "good", "Recorded at " + C.hhmm(h.time) + ".");
  });

  /* ================= LOST AND VULNERABLE PERSONS ================= */
  function renderPersons() {
    var box = $("personList");
    box.innerHTML = "";
    cad.persons.slice().reverse().forEach(function (p) {
      var card = el("div", "person" + (!p.found && !p.closed ? " missing" : "")), head = el("div", "person-head");
      head.appendChild(el("strong", "", p.desc + (p.name ? " (" + p.name + ")" : "")));
      head.appendChild(el("span", "badge", p.closed ? "Handed over " + C.hhmm(p.closed) : p.found ? "Found " + C.hhmm(p.found)
        : "Missing since " + C.hhmm(p.time)));
      card.appendChild(head);
      card.appendChild(el("p", "echo", ["Reported " + C.ukStamp(p.time) + (p.reportedBy ? " by " + p.reportedBy : ""),
        p.lastSeen ? "last seen " + p.lastSeen : "", p.foundAt ? "found at " + p.foundAt : "", p.handedTo ? "handed to " + p.handedTo : ""]
        .filter(Boolean).join("  ·  ")));
      if (!p.closed) {
        var g = el("div", "grid"), input = textIn("", function () {}, p.found ? "e.g. Mother, at the info tent" : "e.g. Info tent, with security");
        g.appendChild(field(p.found ? "Handed to" : "Found where", input));
        var cell = el("div", "field");
        cell.appendChild(el("span", "", "\u00a0"));
        cell.appendChild(btn(p.found ? "Reunited / handed over" : "Found", "primary small", function () {
          var t = C.now(), where = input.value.trim();
          if (p.found) { p.closed = t; p.handedTo = where; } else { p.found = t; p.foundAt = where; }
          cad.log.push({ time: t, by: cad.controller, text: (p.closed ? "Handed over: " : "Found: ") + p.desc +
            (where ? (p.closed ? " to " : " at ") + where : "") });
          changed();
          renderPersons();
          renderLog();
        }, (p.found ? "Handed over: " : "Found: ") + p.desc));
        g.appendChild(cell);
        card.appendChild(g);
      }
      box.appendChild(card);
    });
  }
  $("psAdd").addEventListener("click", function () {
    var desc = $("psDesc").value.trim();
    if (!desc) { message("psResult", "bad", "Describe the person first."); return; }
    var p = { id: cad.persons.reduce(function (n, x) { return Math.max(n, x.id); }, 0) + 1,
      time: C.stamp($("psTime").value) || C.now(), desc: desc, name: $("psName").value.trim(), lastSeen: $("psSeen").value.trim(),
      reportedBy: $("psBy").value.trim(), found: "", foundAt: "", closed: "", handedTo: "", call: 0, by: cad.controller };
    cad.persons.push(p);
    cad.persons.sort(C.byTime);
    cad.log.push({ time: p.time, by: cad.controller, text: "Missing person reported: " + desc + (p.lastSeen ? ", last seen " + p.lastSeen : "") });
    cad.log.sort(C.byTime);
    ["psDesc", "psName", "psSeen", "psBy"].forEach(function (id) { $(id).value = ""; });
    $("psTime").value = C.now();
    $("psResult").hidden = true;
    changed();
    renderPersons();
    renderLog();
  });

  /* ================= MAJOR INCIDENT CASUALTY COUNT ================= */
  function casualtyText(c) {
    return C.TRIAGE.map(function (t) { return t[1] + " " + c[t[0]]; }).join(", ") + "; total " +
      C.TRIAGE.reduce(function (n, t) { return n + c[t[0]]; }, 0);
  }
  function renderCasualties() {
    var body = $("casBody"), last = cad.casualties[cad.casualties.length - 1];
    $("casualtyLatest").hidden = !last;
    if (last) $("casualtyLatest").textContent = "Latest, at " + C.hhmm(last.time) + ": " + casualtyText(last) + ".";
    $("casTable").hidden = !cad.casualties.length;
    body.innerHTML = "";
    cad.casualties.slice().reverse().forEach(function (c) {
      var tr = el("tr");
      tr.appendChild(el("td", "", C.ukStamp(c.time)));
      C.TRIAGE.forEach(function (t) { tr.appendChild(el("td", "num", String(c[t[0]]))); });
      tr.appendChild(el("td", "num", String(C.TRIAGE.reduce(function (n, t) { return n + c[t[0]]; }, 0))));
      tr.appendChild(el("td", "", c.note));
      tr.appendChild(el("td", "", c.by));
      body.appendChild(tr);
    });
  }
  $("casAdd").addEventListener("click", function () {
    var c = { time: C.stamp($("casTime").value) || C.now(), note: $("casNote").value.trim(), by: cad.controller }, ok = false;
    C.TRIAGE.forEach(function (t) {
      var v = $("cas-" + t[0]).value, n = Number(v);
      c[t[0]] = v !== "" && n >= 0 && Math.floor(n) === n ? n : 0;
      if (v !== "") ok = true;
    });
    if (!ok) { message("casResult", "bad", "Enter at least one number."); return; }
    cad.casualties.push(c);
    cad.casualties.sort(C.byTime);
    cad.log.push({ time: c.time, by: cad.controller, text: "Casualty count: " + casualtyText(c) + (c.note ? " (" + c.note + ")" : "") });
    cad.log.sort(C.byTime);
    C.TRIAGE.forEach(function (t) { $("cas-" + t[0]).value = ""; });
    $("casNote").value = "";
    $("casTime").value = C.now();
    changed();
    renderCasualties();
    renderLog();
    message("casResult", "good", "Recorded at " + C.hhmm(c.time) + ": " + casualtyText(c) + ".");
  });

  /* ================= FINALISE ================= */
  /* A finalised event is locked: every tab but the Report is disabled as one. */
  function applyLock() {
    var locked = !!cad.finalised;
    $("lockable").disabled = locked;
    $("lockBanner").hidden = !locked;
    $("lockBanner").textContent = locked ? "Finalised " + C.ukStamp(cad.finalised) + (cad.finalisedBy ? " by " + cad.finalisedBy : "") +
      ". The CAD is locked: the report and call logs are final. Unlock on the Report tab to change anything." : "";
    $("finaliseBtn").hidden = locked;
    $("unlockBtn").hidden = !locked;
    $("finalStatus").className = "notice " + (locked ? "good" : "info");
    $("finalStatus").textContent = locked ? "Finalised " + C.ukStamp(cad.finalised) + (cad.finalisedBy ? " by " + cad.finalisedBy : "") + "."
      : "Not finalised: the report is a draft.";
  }
  $("finaliseBtn").addEventListener("click", function () {
    var open = cad.calls.filter(function (c) { return !c.closed; }).length;
    if (!confirm((open ? open + (open === 1 ? " call is" : " calls are") + " still open. " : "") +
      "Finalise the event? The CAD is locked until you unlock it.")) return;
    cad.finalised = C.now();
    cad.finalisedBy = cad.controller;
    cad.log.push({ time: cad.finalised, by: cad.controller, text: "Event finalised" + (open ? " with " + open + " calls open" : "") });
    changed();
    renderLog();
    applyLock();
    renderReportSummary();
  });
  $("unlockBtn").addEventListener("click", function () {
    if (!confirm("Unlock the CAD? The report will no longer be final, and the unlock goes in the control log.")) return;
    cad.finalised = "";
    cad.finalisedBy = "";
    cad.log.push({ time: C.now(), by: cad.controller, text: "Event unlocked after being finalised" });
    changed();
    renderLog();
    applyLock();
    renderReportSummary();
  });

  /* ================= REPORT ================= */
  /* Another event's figures, side by side in the report. */
  function renderCompare() {
    var x = cad.compare;
    $("compareStatus").textContent = x ? "Comparing with " + (x.name || "another event") + (x.start ? " (" + C.ukStamp(x.start).slice(0, 10) + ")" : "") +
      ": " + x.figures.calls + " calls, " + x.figures.patients + " patients." : "No comparison chosen.";
    $("compareClear").hidden = !x;
  }
  $("compareBtn").addEventListener("click", function () { $("compareFile").click(); });
  $("compareFile").addEventListener("change", function () {
    readJson(this, function (parsed, name) {
      if (!isObj(parsed) || parsed.format !== C.FORMAT) {
        $("compareStatus").textContent = "“" + name + "” is not a CAD exported from this tool.";
        return;
      }
      cad.compare = C.compareFrom(C.clean(parsed));
      changed();
      renderCompare();
    });
  });
  $("compareClear").addEventListener("click", function () { cad.compare = null; changed(); renderCompare(); });

  $("shareReportBtn").hidden = !window.Shared.canSharePdf();
  $("shareReportBtn").addEventListener("click", function () {
    window.Shared.sharePdf(window.CadPDF.report(cad, siteMap), "Event-report-" + fileBase() + ".pdf");
  });

  $("csvBtn").addEventListener("click", function () {
    var name = "Calls-" + fileBase() + ".csv";
    download(new Blob(["\ufeff" + C.csv(cad)], { type: "text/csv" }), name);   // the mark tells Excel it is UTF-8
    message("reportResult", "good", "Downloaded " + name + " with " + cad.calls.length + (cad.calls.length === 1 ? " call." : " calls."));
  });
  function renderReportSummary() {
    var s = C.stats(cad);
    $("reportSummary").textContent = s.calls + (s.calls === 1 ? " call" : " calls") + ", " + s.patients +
      (s.patients === 1 ? " patient" : " patients") + ", " + s.toHospital + " to hospital" +
      (s.duplicates ? ", " + s.duplicates + " duplicate" + (s.duplicates === 1 ? "" : "s") : "") + ". " +
      cad.calls.filter(function (c) { return !c.closed; }).length + " still open.";
  }
  $("reportBtn").addEventListener("click", function () {
    var name = "Event-report-" + fileBase() + ".pdf";
    window.CadPDF.report(cad, siteMap).save(name);
    message("reportResult", "good", "Downloaded " + name + ".");
  });
  $("zipBtn").addEventListener("click", function () {
    if (!cad.calls.length && !cad.methane.length) {
      message("reportResult", "bad", "There are no calls to put in the zip yet.");
      return;
    }
    var files = cad.calls.slice().sort(function (a, b) { return a.id - b.id; }).map(function (c) {
      return { name: "Call-" + C.pad3(c.id) + ".pdf", data: new Uint8Array(window.CadPDF.call(cad, c).output("arraybuffer")) };
    }).concat(cad.methane.map(function (m, i) {
      return { name: "METHANE-" + (i + 1) + ".pdf", data: new Uint8Array(window.CadPDF.methane(cad, m).output("arraybuffer")) };
    }));
    var name = "Call-logs-" + fileBase() + ".zip";
    download(window.Zip(files), name);
    message("reportResult", "good", "Downloaded " + name + " with " + files.length + (files.length === 1 ? " PDF." : " PDFs."));
  });

  $("exportBtn").addEventListener("click", function () {
    var name = "CAD-" + fileBase() + ".json";
    download(json(exportData()), name);
    message("saveResult", "good", "Saved the whole CAD as " + name + ".");
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    readJson(this, function (parsed, name) {
      if (!isObj(parsed) || parsed.format !== C.FORMAT) {
        message("saveResult", "bad", "“" + name + "” is not a CAD exported from this tool. Nothing has been changed.");
        return;
      }
      if (!confirm("Replace everything in this CAD with “" + name + "”?")) return;
      cad = C.clean(parsed);
      takeMap(parsed);
      current = 0;
      save();
      renderAll();
      message("saveResult", "good", "Opened “" + name + "”: " + cad.calls.length + (cad.calls.length === 1 ? " call." : " calls."));
    });
  });
  $("newEventBtn").addEventListener("click", function () {
    if (!confirm("Start a new event? The calls, counts, control log, METHANE messages and breaks are cleared. Export " +
      "the CAD first if you want to keep them.")) return;
    cad.calls = [];
    cad.tc = [];
    cad.log = [];
    cad.methane = [];
    cad.casualties = [];
    cad.conditions = [];
    cad.persons = [];
    cad.hospitalStatus = {};
    cad.finalised = "";
    cad.finalisedBy = "";
    cad.units.forEach(function (u) { u.history = []; u.crewLog = []; });
    current = 0;
    save();
    renderAll();
    showTab("setup");
  });

  /* ---------------- start ---------------- */
  function renderAll() {
    fillSetup();
    showCompany();
    renderSetup();
    renderWalkUps();
    renderMap();
    renderCasualties();
    renderConditions();
    renderPersons();
    renderCompare();
    applyLock();
    renderTc();
    renderLog();
    renderMethane();
    renderCall();
    refresh();
  }

  load();
  loadMap();
  startBackup();
  if (!cad.company) cad.company = window.Shared.savedCompany();
  save();
  renderAll();
  if (cad.units.length) showTab("cad");   // set up already: straight to the CAD

  // The clock every second; the board, timers and alerts every five.
  var ticks = 0;
  setInterval(function () {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    $("clock").textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    if (++ticks % 5 === 0) refresh();
  }, 1000);

  window.addEventListener("storage", function (e) {
    if (e.key === "company-profile/v1") showCompany();
    if (e.key && e.key.indexOf("deployment-maker/") === 0) renderDm();
    // The CAD open in another tab of this browser saved: take its version, so neither tab undoes the other.
    if (e.key === C.KEY || e.key === MAP_KEY) {
      load();
      loadMap();
      renderAll();
    }
  });
})();
