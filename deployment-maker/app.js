/* Deployment Maker: units, the people on them and what they carry, for a
   printed deployment log. Everything is kept in localStorage on this device. */
(function () {
  "use strict";

  var KEY = "deployment-maker/v1";
  var PROFILE_KEY = "company-profile/v1";   // written by the Company Profile app
  var FORMAT = "deployment-maker/deployment";
  var PLAN_FORMAT = "deployment-maker/plan";
  var EVENT_FIELDS = ["eventName", "venue", "eventDate", "madeBy"];
  var COMPANY_TEXT = ["companyName", "companyPhone", "companyAddress", "cqcNumber"];
  var $ = function (id) { return document.getElementById(id); };

  function blank() {
    return { eventName: "", venue: "", eventDate: "", madeBy: "", company: null, units: [] };
  }
  function newPerson() { return { name: "", grade: "", radio: "", manager: false }; }
  function newUnit(callsign) {
    return { callsign: callsign, ambulance: false, reg: "", roaming: false, location: "",
      hasKitBag: true, kitBag: "", hasDrugBag: true, drugBag: "", staff: [newPerson()] };
  }
  var dep = blank();

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

  function cleanPerson(raw) {
    return { name: str(raw.name), grade: str(raw.grade), radio: str(raw.radio), manager: raw.manager === true };
  }

  function cleanUnit(raw) {
    return {
      callsign: str(raw.callsign), ambulance: raw.ambulance === true, reg: str(raw.reg),
      roaming: raw.roaming === true, location: str(raw.location),
      // Files saved before the bag ticks existed had a box for both bags.
      hasKitBag: raw.hasKitBag !== false, kitBag: str(raw.kitBag),
      hasDrugBag: raw.hasDrugBag !== false, drugBag: str(raw.drugBag),
      staff: (Array.isArray(raw.staff) ? raw.staff : []).filter(isObj).map(cleanPerson)
    };
  }

  function clean(raw) {
    var out = blank();
    if (!isObj(raw)) return out;
    EVENT_FIELDS.forEach(function (f) { out[f] = str(raw[f]); });
    out.company = cleanCompany(raw.company);
    out.units = (Array.isArray(raw.units) ? raw.units : []).filter(isObj).map(cleanUnit);
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(dep)); return true; } catch (e) { return false; }
  }

  function load() {
    try { dep = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { dep = blank(); }
  }

  /* ---------------- small DOM helpers ---------------- */
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

  function message(id, kind, text) {
    $(id).className = "notice " + kind;
    $(id).textContent = text;
    $(id).hidden = false;
  }

  /* Text inputs update state in place and do not re-render, so typing keeps focus. */
  function bound(obj, key, attrs) {
    var input = el("input");
    Object.keys(attrs).forEach(function (a) { input.setAttribute(a, attrs[a]); });
    input.value = obj[key];
    input.addEventListener("input", function () { obj[key] = input.value; save(); });
    return input;
  }

  function tick(label, obj, key, onChange) {
    var row = el("label", "check-row");
    var box = el("input");
    box.type = "checkbox";
    box.checked = obj[key];
    box.addEventListener("change", function () {
      obj[key] = box.checked;
      save();
      if (onChange) onChange();
    });
    row.appendChild(box);
    row.appendChild(el("span", "", label));
    return row;
  }

  function slug(s) {
    return s.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /* ---------------- company ---------------- */
  function savedProfile() {
    var p;
    try { p = cleanCompany(JSON.parse(localStorage.getItem(PROFILE_KEY))); } catch (e) { p = null; }
    return p && p.companyName.trim() ? p : null;
  }

  function showCompany() {
    var c = dep.company, box = $("companySummary");
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
      var bits = [c.companyPhone, c.cqcRegistered && c.cqcNumber ? "CQC " + c.cqcNumber : ""]
        .filter(Boolean).join("  ·  ");
      if (bits) text.appendChild(el("span", "echo", bits));
      box.appendChild(text);
    }
    var p = savedProfile();
    $("companyUseBtn").hidden = !p;
    if (p) $("companyUseBtn").textContent = "Use saved company profile (" + p.companyName.trim() + ")";
  }

  function setCompany(c, how) {
    dep.company = c;
    save();
    showCompany();
    message("companyResult", "good", how + " company details for " + (c.companyName.trim() || "this organisation") +
      (c.logo ? ", including the logo." : "."));
  }

  $("companyUseBtn").addEventListener("click", function () {
    var p = savedProfile();
    if (p) setCompany(p, "Using");
  });

  /* A Company Profile file, or the company half of any export from the other tools. */
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

  /* ---------------- event ---------------- */
  function fillEvent() { EVENT_FIELDS.forEach(function (f) { $(f).value = dep[f]; }); }
  EVENT_FIELDS.forEach(function (f) {
    $(f).addEventListener("input", function () { dep[f] = $(f).value; save(); });
  });

  /* ---------------- units ---------------- */
  function move(list, i, delta) {
    var j = i + delta;
    if (j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
    save();
    render();
  }

  function renderUnit(u, ui) {
    var card = el("div", "card unit");
    var head = el("div", "unit-head");
    head.appendChild(bound(u, "callsign", { type: "text", class: "unit-callsign", placeholder: "Callsign",
      "aria-label": "Callsign" }));
    var btns = el("div", "med-btns");
    btns.appendChild(button("↑", "", "Move unit up", function () { move(dep.units, ui, -1); }));
    btns.appendChild(button("↓", "", "Move unit down", function () { move(dep.units, ui, 1); }));
    btns.appendChild(button("Remove", "del", "Remove unit", function () {
      var named = u.staff.filter(function (p) { return p.name.trim(); }).length;
      if (named && !confirm("Remove " + (u.callsign.trim() || "this unit") + " and the " + named +
        (named === 1 ? " person" : " people") + " on it?")) return;
      dep.units.splice(ui, 1);
      save();
      render();
    }));
    head.appendChild(btns);
    card.appendChild(head);

    var opts = el("div", "unit-opts");
    // Roaming, or a fixed location.
    var loc = bound(u, "location", { type: "text", placeholder: "Location, e.g. Main stage", "aria-label": "Location" });
    loc.hidden = u.roaming;
    var where = el("div", "opt-row");
    where.appendChild(tick("Roaming", u, "roaming", function () {
      loc.hidden = u.roaming;
      if (!u.roaming) loc.focus();
    }));
    where.appendChild(loc);
    opts.appendChild(where);
    // An ambulance asks for its registration.
    var reg = bound(u, "reg", { type: "text", placeholder: "Vehicle registration", "aria-label": "Vehicle registration" });
    reg.hidden = !u.ambulance;
    var amb = el("div", "opt-row");
    amb.appendChild(tick("Ambulance", u, "ambulance", function () {
      reg.hidden = !u.ambulance;
      if (u.ambulance) reg.focus();
    }));
    amb.appendChild(reg);
    opts.appendChild(amb);
    // Not every unit has bags (event control, say). Ticked with no number, the sheet has a box to write it in.
    [["Kit bag", "hasKitBag", "kitBag", "KB-03"], ["Drug bag", "hasDrugBag", "drugBag", "DB-01"]].forEach(function (b) {
      var num = bound(u, b[2], { type: "text", placeholder: b[0] + " number, e.g. " + b[3] +
        ", or leave blank to write in on the day", "aria-label": b[0] + " number" });
      num.hidden = !u[b[1]];
      var row = el("div", "opt-row");
      row.appendChild(tick(b[0], u, b[1], function () {
        num.hidden = !u[b[1]];
        if (u[b[1]]) num.focus();
      }));
      row.appendChild(num);
      opts.appendChild(row);
    });
    card.appendChild(opts);

    if (u.staff.length) {
      var cols = el("div", "staff-row staff-cols");
      ["Name", "Clinical grade", "Radio", "Manager", ""].forEach(function (t) { cols.appendChild(el("span", "", t)); });
      card.appendChild(cols);
    }
    u.staff.forEach(function (p, pi) {
      var row = el("div", "staff-row");
      row.appendChild(bound(p, "name", { type: "text", placeholder: "Name, or leave blank", "aria-label": "Name" }));
      row.appendChild(bound(p, "grade", { type: "text", list: "grades", placeholder: "Grade", "aria-label": "Clinical grade" }));
      row.appendChild(bound(p, "radio", { type: "text", placeholder: "Radio", "aria-label": "Radio" }));
      row.appendChild(tick("Manager", p, "manager"));
      var b = el("div", "med-btns");
      b.appendChild(button("↑", "", "Move person up", function () { move(u.staff, pi, -1); }));
      b.appendChild(button("↓", "", "Move person down", function () { move(u.staff, pi, 1); }));
      b.appendChild(button("×", "del", "Remove person", function () {
        u.staff.splice(pi, 1);
        save();
        render();
      }));
      row.appendChild(b);
      card.appendChild(row);
    });

    var add = el("button", "btn ghost small add-person", "+ Add person");
    add.type = "button";
    add.addEventListener("click", function () {
      u.staff.push(newPerson());
      save();
      render();
      var names = $("unitList").querySelectorAll(".unit")[ui].querySelectorAll("input[aria-label='Name']");
      names[names.length - 1].focus();
    });
    card.appendChild(add);
    return card;
  }

  function render() {
    var list = $("unitList");
    list.innerHTML = "";
    $("unitCount").textContent = dep.units.length;
    $("unitEmpty").hidden = dep.units.length > 0;
    dep.units.forEach(function (u, ui) { list.appendChild(renderUnit(u, ui)); });
  }

  $("unitForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var callsign = $("unitCallsign").value.trim();
    if (!callsign) { $("unitCallsign").focus(); return; }
    dep.units.push(newUnit(callsign));
    $("unitCallsign").value = "";
    save();
    render();
    var names = $("unitList").querySelectorAll("input[aria-label='Name']");
    names[names.length - 1].focus();
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
    if (name === "generate") showBlanks();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.goto); });
  });

  /* ---------------- generate ---------------- */
  function problems() {
    var out = [];
    if (!dep.units.length) out.push("Add at least one unit (Units).");
    dep.units.forEach(function (u, i) {
      if (!u.callsign.trim()) out.push("Unit " + (i + 1) + " has no callsign.");
    });
    return out;
  }

  /* Blanks are allowed: they print as space to write in. This says how many. */
  function showBlanks() {
    var names = 0, regs = 0, places = 0, kits = 0, drugs = 0, parts = [];
    dep.units.forEach(function (u) {
      names += u.staff.filter(function (p) { return !p.name.trim(); }).length;
      if (u.ambulance && !u.reg.trim()) regs++;
      if (!u.roaming && !u.location.trim()) places++;
      if (u.hasKitBag && !u.kitBag.trim()) kits++;
      if (u.hasDrugBag && !u.drugBag.trim()) drugs++;
    });
    if (names) parts.push(names + (names === 1 ? " name" : " names"));
    if (regs) parts.push(regs + (regs === 1 ? " vehicle registration" : " vehicle registrations"));
    if (places) parts.push(places + (places === 1 ? " location" : " locations"));
    if (kits) parts.push(kits + (kits === 1 ? " kit bag number" : " kit bag numbers"));
    if (drugs) parts.push(drugs + (drugs === 1 ? " drug bag number" : " drug bag numbers"));
    $("blankNote").hidden = !parts.length;
    $("blankNote").textContent = "Left blank to fill in by hand on the printed sheet: " + parts.join(", ") + ".";
  }

  function fileBase() {
    return slug([dep.eventName, dep.venue, dep.eventDate].join(" ")) || "deployment";
  }

  function build() {
    var errs = problems();
    $("genError").hidden = !errs.length;
    $("genError").textContent = errs.join(" ");
    if (errs.length) { showTab("generate"); return null; }
    return window.DeploymentPDF.build(dep);
  }

  function download() {
    var pdf = build();
    if (pdf) pdf.save("Deployment-" + fileBase() + ".pdf");
  }
  $("generateBtn").addEventListener("click", download);
  $("generateTop").addEventListener("click", download);
  $("previewBtn").addEventListener("click", function () {
    var pdf = build();
    if (pdf) window.open(pdf.output("bloburl"), "_blank");
  });

  /* ---------------- save / open ---------------- */
  function downloadJson(obj, name) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    var a = el("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  $("exportBtn").addEventListener("click", function () {
    var name = "Deployment-" + fileBase() + ".json";
    downloadJson(Object.assign({ format: FORMAT, version: 1 }, dep), name);
    message("saveResult", "good", "Saved as " + name + ".");
  });

  /* A plan keeps the shape of the deployment and leaves the day's details blank. */
  function asPlan() {
    return {
      format: PLAN_FORMAT, version: 1,
      eventName: dep.eventName, venue: dep.venue, eventDate: "", madeBy: "",
      units: dep.units.map(function (u) {
        return {
          callsign: u.callsign, ambulance: u.ambulance, reg: "", roaming: u.roaming, location: u.location,
          hasKitBag: u.hasKitBag, kitBag: "", hasDrugBag: u.hasDrugBag, drugBag: "",
          staff: u.staff.map(function (p) { return { name: "", grade: p.grade, radio: "", manager: p.manager }; })
        };
      })
    };
  }

  $("planBtn").addEventListener("click", function () {
    if (!dep.units.length) {
      message("saveResult", "bad", "Add the units first: a plan is the units and the posts on them.");
      return;
    }
    var name = "Plan-" + (slug(dep.venue) || slug(dep.eventName) || "deployment") + ".json";
    downloadJson(asPlan(), name);
    message("saveResult", "good", "Saved the plan as " + name + ". Open it next time to start with these units " +
      "and the names left blank.");
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
      var plan = isObj(parsed) && parsed.format === PLAN_FORMAT;
      if (!isObj(parsed) || (!plan && parsed.format !== FORMAT) || !Array.isArray(parsed.units)) {
        message("openResult", "bad", "“" + file.name + "” is not a plan or deployment saved from this " +
          "tool. Nothing has been changed.");
        return;
      }
      if (dep.units.length && !confirm("Replace the event and units you have now with “" + file.name + "”?")) return;
      var next = clean(parsed);
      if (!next.company) next.company = dep.company;   // a plan carries no company: keep yours
      dep = next;
      save();
      fillEvent();
      showCompany();
      render();
      message("openResult", "good", (plan ? "Opened the plan “" : "Opened “") + file.name + "”: " +
        dep.units.length + (dep.units.length === 1 ? " unit." : " units.") +
        (plan ? " Fill in the names now, or print it and fill them in by hand." : ""));
    };
    reader.readAsText(file);
  });

  $("resetAll").addEventListener("click", function () {
    if (!confirm("Clear the event and units? Your company details are kept. Save the deployment first if " +
      "you want to keep it.")) return;
    var company = dep.company;
    dep = blank();
    dep.company = company;
    save();
    fillEvent();
    render();
    showTab("setup");
  });

  load();
  // The company comes from the saved profile until something else is chosen.
  if (!dep.company) {
    dep.company = savedProfile();
    if (dep.company) save();
  }
  fillEvent();
  showCompany();
  render();
})();
