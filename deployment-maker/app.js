/* Deployment Maker: units, the people on them and what they carry, for a
   printed deployment log. Everything is kept in localStorage on this device. */
(function () {
  "use strict";

  var KEY = "deployment-maker/v1";
  var PROFILE_KEY = "company-profile/v1";   // written by the Company Profile app
  var FORMAT = "deployment-maker/deployment";
  var PLAN_FORMAT = "deployment-maker/plan";
  var PLANS_KEY = "deployment-maker/plans";   // plans saved on this device
  // Recorded on the day: [field, column heading, button].
  var TIMES = [["signedIn", "Signed in", "Sign in"], ["breakStart", "Break started", "Start break"],
    ["breakEnd", "Break ended", "End break"], ["stoodDown", "Stood down", "Stand down"]];
  var EVENT_FIELDS = ["eventName", "venue", "eventDate", "madeBy"];
  var COMPANY_TEXT = ["companyName", "companyPhone", "companyAddress", "cqcNumber"];
  var $ = function (id) { return document.getElementById(id); };

  function blank() {
    return { eventName: "", venue: "", eventDate: "", madeBy: "", company: null, radioList: true, useDay: false, units: [] };
  }
  function newPerson() {
    return { name: "", grade: "", radio: "", manager: false, signedIn: "", breakStart: "", breakEnd: "", stoodDown: "" };
  }
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

  /* A time of day as a time box gives it ("14:05"), or nothing. */
  function time(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ""; }

  function cleanPerson(raw) {
    var p = { name: str(raw.name), grade: str(raw.grade), radio: str(raw.radio), manager: raw.manager === true };
    TIMES.forEach(function (t) { p[t[0]] = time(raw[t[0]]); });
    return p;
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
    out.radioList = raw.radioList !== false;
    out.useDay = raw.useDay === true;
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

  /* A unit's set-up without the day's details: no names, radios, bag numbers,
     registration or times. What a plan keeps, and what Copy starts from. */
  function planUnit(u) {
    return {
      callsign: u.callsign, ambulance: u.ambulance, reg: "", roaming: u.roaming, location: u.location,
      hasKitBag: u.hasKitBag, kitBag: "", hasDrugBag: u.hasDrugBag, drugBag: "",
      staff: u.staff.map(function (p) {
        var q = newPerson();
        q.grade = p.grade;
        q.manager = p.manager;
        return q;
      })
    };
  }

  /* The same set-up under the next free callsign: Alpha 1 becomes Alpha 2, Silver becomes Silver 2. */
  function copyUnit(u) {
    var copy = planUnit(u);
    var m = /^(.*?)(\d+)$/.exec(u.callsign.trim());
    var base = m ? m[1] : u.callsign.trim() + " ", n = m ? +m[2] : 1;
    var taken = dep.units.map(function (x) { return x.callsign.trim().toLowerCase(); });
    do { n++; } while (taken.indexOf((base + n).toLowerCase()) >= 0);
    copy.callsign = base + n;
    return copy;
  }
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
    btns.appendChild(button("Copy", "", "Copy unit", function () {
      dep.units.splice(ui + 1, 0, copyUnit(u));
      save();
      render();
      var callsign = $("unitList").querySelectorAll(".unit-callsign")[ui + 1];
      callsign.focus();
      callsign.select();
    }));
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
        ", or leave blank to write in on the day", "aria-label": b[0] + " number", list: b[2] + "List" });
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

  /* Bag numbers already set up in the Bag Tracker and Drug Bag Tracker on this
     device, offered as suggestions while typing a unit's bag numbers. */
  function bagSuggestions() {
    var kit = [], drug = [];
    try {
      var bag = JSON.parse(localStorage.getItem("bag-tracker/v1"));
      if (bag && typeof bag.bagNumber === "string") kit = bag.bagNumber.split(/[,;\n]+/);
    } catch (e) { /* nothing usable stored */ }
    try {
      var d = JSON.parse(localStorage.getItem("drug-bag-tracker/v2"));
      var n = d && d.docs && d.docs.bag && d.docs.bag.setup && d.docs.bag.setup.bagNumber;
      if (typeof n === "string") drug = [n];
    } catch (e) { /* nothing usable stored */ }
    [["kitBagList", kit], ["drugBagList", drug]].forEach(function (l) {
      var list = $(l[0]);
      list.innerHTML = "";
      l[1].map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (v) {
        var o = el("option");
        o.value = v;
        list.appendChild(o);
      });
    });
  }

  /* ---------------- on the day ---------------- */
  function nowTime() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function status(p) {
    if (p.stoodDown) return "Stood down";
    if (!p.signedIn) return "Not signed in";
    if (p.breakStart && !p.breakEnd) return "On break";
    return "On duty";
  }

  /* What can happen next: one break, and standing down at any point once signed in. */
  function actions(p) {
    if (p.stoodDown) return [];
    if (!p.signedIn) return [["signedIn", "Sign in", true]];
    if (p.breakStart && !p.breakEnd) return [["breakEnd", "End break", true]];
    var out = [];
    if (!p.breakStart) out.push(["breakStart", "Start break", false]);
    out.push(["stoodDown", "Stand down", !!p.breakEnd]);
    return out;
  }

  var STATUS_CLASS = { "Not signed in": "idle", "On duty": "on", "On break": "break", "Stood down": "off" };

  function renderDay() {
    var list = $("dayList"), counts = { "On duty": 0, "On break": 0, "Stood down": 0, "Not signed in": 0 };
    list.innerHTML = "";
    $("dayEmpty").hidden = dep.units.length > 0;
    dep.units.forEach(function (u) {
      var card = el("div", "card day-unit");
      var head = el("div", "day-head");
      head.appendChild(el("strong", "", u.callsign.trim() || "Unit"));
      head.appendChild(el("span", "echo", u.roaming ? "Roaming" : u.location.trim()));
      card.appendChild(head);
      u.staff.forEach(function (p) {
        var st = status(p);
        counts[st]++;
        var row = el("div", "day-row");
        var who = el("div", "day-who");
        // A post with no name yet can be named here, as the person arrives.
        if (p.name.trim()) who.appendChild(el("strong", "", p.name));
        else who.appendChild(bound(p, "name", { type: "text", placeholder: "Name", "aria-label": "Name" }));
        who.appendChild(el("span", "echo", [p.grade, p.radio && "Radio " + p.radio, p.manager && "Manager"]
          .filter(Boolean).join("  ·  ")));
        row.appendChild(who);
        row.appendChild(el("span", "day-status " + STATUS_CLASS[st], st));
        var times = el("div", "day-times");
        TIMES.forEach(function (t) {
          var f = el("label", "day-time");
          f.appendChild(el("span", "", t[1]));
          var input = el("input");
          input.type = "time";
          input.value = p[t[0]];
          input.addEventListener("change", function () {
            p[t[0]] = time(input.value);
            save();
            renderDay();
          });
          f.appendChild(input);
          times.appendChild(f);
        });
        row.appendChild(times);
        var acts = el("div", "day-actions");
        actions(p).forEach(function (a) {
          var b = el("button", "btn small " + (a[2] ? "primary" : "ghost"), a[1]);
          b.type = "button";
          b.addEventListener("click", function () {
            p[a[0]] = nowTime();
            save();
            renderDay();
          });
          acts.appendChild(b);
        });
        row.appendChild(acts);
        card.appendChild(row);
      });
      list.appendChild(card);
    });
    $("daySummary").textContent = Object.keys(counts).map(function (k) { return counts[k] + " " + k.toLowerCase(); })
      .join("  ·  ");
  }

  /* On the day is used rarely, so its tab only shows when this deployment turns it on. */
  function applyDay() {
    $("useDay").checked = dep.useDay;
    $("dayTab").hidden = !dep.useDay;
    $("generateTab").textContent = dep.useDay ? "4. Generate" : "3. Generate";
    $("generateBack").dataset.goto = dep.useDay ? "day" : "units";
    $("unitsNext").dataset.goto = dep.useDay ? "day" : "generate";
    $("unitsNext").innerHTML = dep.useDay ? "Next: On the day &rarr;" : "Next: Generate &rarr;";
  }
  $("useDay").addEventListener("change", function () {
    dep.useDay = this.checked;
    save();
    applyDay();
  });

  $("clearTimes").addEventListener("click", function () {
    if (!confirm("Clear every sign-in, break and stand-down time? Names and units are kept.")) return;
    dep.units.forEach(function (u) {
      u.staff.forEach(function (p) { TIMES.forEach(function (t) { p[t[0]] = ""; }); });
    });
    save();
    renderDay();
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
    // Names can be typed on either tab, so each is redrawn when shown.
    if (name === "units") render();
    if (name === "day") renderDay();
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

  $("radioList").addEventListener("change", function () {
    dep.radioList = this.checked;
    save();
  });

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
    if (!dep.units.length) {
      message("saveResult", "bad", "Add the units first: there is nothing to save yet.");
      return;
    }
    var name = "Deployment-" + fileBase() + ".json";
    downloadJson(Object.assign({ format: FORMAT, version: 1 }, dep), name);
    message("saveResult", "good", "Saved as " + name + ".");
  });

  /* A plan keeps the shape of the deployment and leaves the day's details blank. */
  function asPlan() {
    return {
      format: PLAN_FORMAT, version: 1,
      eventName: dep.eventName, venue: dep.venue, eventDate: "", madeBy: "", useDay: dep.useDay,
      units: dep.units.map(planUnit)
    };
  }

  function savedPlans() {
    var list;
    try { list = JSON.parse(localStorage.getItem(PLANS_KEY)); } catch (e) { list = null; }
    return (Array.isArray(list) ? list : []).filter(function (p) {
      return isObj(p) && typeof p.name === "string" && isObj(p.plan);
    });
  }

  function renderPlans() {
    var box = $("planList"), plans = savedPlans();
    box.innerHTML = "";
    $("planEmpty").hidden = plans.length > 0;
    plans.forEach(function (entry, i) {
      var row = el("div", "plan-row");
      var info = el("div");
      info.appendChild(el("strong", "", entry.name));
      var units = Array.isArray(entry.plan.units) ? entry.plan.units.length : 0;
      var saved = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(entry.saved));
      info.appendChild(el("span", "echo", units + (units === 1 ? " unit" : " units") +
        (saved ? "  ·  saved " + saved[3] + "/" + saved[2] + "/" + saved[1] : "")));
      row.appendChild(info);
      var btns = el("div", "med-btns");
      var open = el("button", "btn primary small", "Open");
      open.type = "button";
      open.setAttribute("aria-label", "Open the plan " + entry.name);
      open.addEventListener("click", function () { openParsed(entry.plan, "the plan “" + entry.name + "”"); });
      btns.appendChild(open);
      btns.appendChild(button("Delete", "del", "Delete the plan " + entry.name, function () {
        if (!confirm("Delete the saved plan “" + entry.name + "” from this device?")) return;
        var all = savedPlans();
        all.splice(i, 1);
        try { localStorage.setItem(PLANS_KEY, JSON.stringify(all)); } catch (e) { /* stays listed */ }
        renderPlans();
      }));
      row.appendChild(btns);
      box.appendChild(row);
    });
  }

  $("planBtn").addEventListener("click", function () {
    if (!dep.units.length) {
      message("saveResult", "bad", "Add the units first: a plan is the units and the posts on them.");
      return;
    }
    var name = prompt("Name this plan, for example after the venue:", dep.venue.trim() || dep.eventName.trim());
    if (name === null) return;
    name = name.trim();
    if (!name) {
      message("saveResult", "bad", "A plan needs a name. Nothing has been saved.");
      return;
    }
    var plans = savedPlans(), at = -1;
    plans.forEach(function (p, i) { if (p.name.toLowerCase() === name.toLowerCase()) at = i; });
    if (at >= 0 && !confirm("Replace the saved plan “" + plans[at].name + "”?")) return;
    var entry = { name: name, saved: new Date().toISOString(), plan: asPlan() };
    if (at >= 0) plans[at] = entry; else plans.push(entry);
    plans.sort(function (a, b) { return a.name.localeCompare(b.name); });
    try {
      localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    } catch (e) {
      message("saveResult", "bad", "This browser would not store the plan. Download it as a file instead.");
      return;
    }
    renderPlans();
    message("saveResult", "good", "Saved the plan “" + name + "” on this device. Open it from the Event " +
      "tab next time to start with these units and the names left blank.");
  });

  $("planFileBtn").addEventListener("click", function () {
    if (!dep.units.length) {
      message("saveResult", "bad", "Add the units first: a plan is the units and the posts on them.");
      return;
    }
    var name = "Plan-" + (slug(dep.venue) || slug(dep.eventName) || "deployment") + ".json";
    downloadJson(asPlan(), name);
    message("saveResult", "good", "Saved the plan as " + name + ", to share or to open on another device.");
  });

  /* Opens a plan or a whole deployment. False if it is neither; `label` names it in messages. */
  function openParsed(parsed, label) {
    var plan = isObj(parsed) && parsed.format === PLAN_FORMAT;
    if (!isObj(parsed) || (!plan && parsed.format !== FORMAT) || !Array.isArray(parsed.units)) return false;
    if (dep.units.length && !confirm("Replace the event and units you have now with " + label + "?")) return true;
    var next = clean(parsed);
    if (!next.company) next.company = dep.company;   // a plan carries no company: keep yours
    dep = next;
    save();
    fillEvent();
    showCompany();
    render();
    $("radioList").checked = dep.radioList;
    applyDay();
    message("openResult", "good", "Opened " + label + ": " + dep.units.length +
      (dep.units.length === 1 ? " unit." : " units.") +
      (plan ? " Fill in the names now, or print it and fill them in by hand." : ""));
    return true;
  }

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
      if (!openParsed(parsed, "\u201c" + file.name + "\u201d")) {
        message("openResult", "bad", "\u201c" + file.name + "\u201d is not a plan or deployment saved from this " +
          "tool. Nothing has been changed.");
      }
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
    applyDay();
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
  renderPlans();
  bagSuggestions();
  $("radioList").checked = dep.radioList;
  applyDay();
  // Plans or bags saved in another tab show up here without a reload.
  window.addEventListener("storage", function () {
    renderPlans();
    bagSuggestions();
  });
})();
