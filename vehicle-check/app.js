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
  var PHOTO_SLOTS = [["front", "Front"], ["back", "Back"], ["right", "Right side"], ["left", "Left side"],
    ["cab", "Cab"], ["saloon", "Patient compartment"]];
  var DEFECT_PHOTOS = 3;   // per defect
  var PHOTO_EDGE = 1000;   // px: plenty for an A4 print, small enough to store a dozen
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
      return { name: s[0], items: s[1].map(function (n) { return { name: n, status: "", note: "", photos: [] }; }) };
    });
  }

  function blank() {
    var c = { company: null, fit: "", sections: standardSections(), photos: {}, crew: [] };
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

  /* A stored photo: a JPEG or PNG data URL, with its size for the PDF. */
  function cleanPhoto(p) {
    return isObj(p) && typeof p.src === "string" && /^data:image\/(jpeg|png);base64,/.test(p.src) &&
      +p.w > 0 && +p.h > 0 ? { src: p.src, w: +p.w, h: +p.h } : null;
  }

  function clean(raw) {
    var out = blank();
    if (!isObj(raw)) return out;
    FIELDS.forEach(function (f) { out[f] = str(raw[f]); });
    out.company = cleanCompany(raw.company);
    out.fit = raw.fit === "yes" || raw.fit === "no" ? raw.fit : "";
    out.crew = (Array.isArray(raw.crew) ? raw.crew : []).filter(isObj).map(function (m) {
      var sig = cleanPhoto(m.sig);
      return { name: str(m.name), grade: str(m.grade), sig: sig && sig.src.indexOf("data:image/png") === 0 ? sig : null,
        signedAt: /^([01]\d|2[0-3]):[0-5]\d$/.test(m.signedAt) ? m.signedAt : "" };
    });
    PHOTO_SLOTS.forEach(function (s) {
      var p = isObj(raw.photos) ? cleanPhoto(raw.photos[s[0]]) : null;
      if (p) out.photos[s[0]] = p;
    });
    if (Array.isArray(raw.sections)) {
      out.sections = raw.sections.filter(isObj).map(function (s) {
        return { name: str(s.name), items: (Array.isArray(s.items) ? s.items : []).filter(isObj).map(function (i) {
          var st = str(i.status);
          return { name: str(i.name), status: ["ok", "defect", "na"].indexOf(st) >= 0 ? st : "", note: str(i.note),
            photos: (Array.isArray(i.photos) ? i.photos : []).map(cleanPhoto).filter(Boolean).slice(0, DEFECT_PHOTOS) };
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

  /* ---------------- photos ---------------- */
  /* Shrunk to a JPEG before storing: a phone photo would fill the browser's storage on its own. */
  function readPhoto(file, done) {
    var reader = new FileReader();
    reader.onerror = function () { done(null); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { done(null); };
      img.onload = function () {
        var scale = Math.min(1, PHOTO_EDGE / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var g = canvas.getContext("2d");
        g.fillStyle = "#fff";   // transparent PNGs get a white background, not black
        g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        done({ src: canvas.toDataURL("image/jpeg", 0.7), w: w, h: h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* Stores a change; if the browser has no room, undoes it and says so instead of losing it quietly. */
  function saveOrUndo(undo, where) {
    if (save()) return true;
    undo();
    save();
    message(where, "bad", "This browser has no room to store that photo. Save the check to a file and start a " +
      "new one, or remove some photos.");
    return false;
  }

  function photoPicker(onPhoto) {
    var input = el("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");   // the back camera, on a phone
    input.hidden = true;
    input.addEventListener("change", function () {
      var file = input.files[0];
      input.value = "";
      if (file) readPhoto(file, onPhoto);
    });
    return input;
  }

  function renderPhotos() {
    var grid = $("photoGrid");
    grid.innerHTML = "";
    PHOTO_SLOTS.forEach(function (s) {
      var tile = el("div", "photo-tile"), p = chk.photos[s[0]];
      tile.appendChild(el("span", "", s[1]));
      var box = el("div", "photo-box");
      if (p) {
        var img = el("img");
        img.src = p.src;
        img.alt = s[1] + " of the vehicle";
        box.appendChild(img);
      } else {
        box.textContent = "No photo";
      }
      tile.appendChild(box);
      var input = photoPicker(function (photo) {
        if (!photo) { message("photoResult", "bad", "That file could not be read as a photo."); return; }
        var before = chk.photos[s[0]];
        chk.photos[s[0]] = photo;
        if (saveOrUndo(function () { if (before) chk.photos[s[0]] = before; else delete chk.photos[s[0]]; }, "photoResult")) {
          $("photoResult").hidden = true;
        }
        renderPhotos();
      });
      input.setAttribute("aria-label", "Photo: " + s[1]);
      var btns = el("div", "med-btns");
      var take = el("button", "btn ghost small", p ? "Replace" : "Take photo");
      take.type = "button";
      take.addEventListener("click", function () { input.click(); });
      btns.appendChild(take);
      if (p) {
        var del = el("button", "btn ghost small", "Remove");
        del.type = "button";
        del.setAttribute("aria-label", "Remove the " + s[1] + " photo");
        del.addEventListener("click", function () { delete chk.photos[s[0]]; save(); renderPhotos(); });
        btns.appendChild(del);
      }
      tile.appendChild(btns);
      tile.appendChild(input);
      grid.appendChild(tile);
    });
  }

  /* ---------------- crew sign-off ---------------- */
  function renderCrew() {
    var list = $("crewList");
    list.innerHTML = "";
    chk.crew.forEach(function (m, mi) {
      var row = el("div", "crew-row");
      [["name", "Name", "text", ""], ["grade", "Clinical grade", "text", "grades"]].forEach(function (f) {
        var label = el("label", "field");
        label.appendChild(el("span", "", f[1]));
        var input = el("input");
        input.type = f[2];
        input.value = m[f[0]];
        if (f[3]) input.setAttribute("list", f[3]);
        input.addEventListener("input", function () { m[f[0]] = input.value; save(); });
        label.appendChild(input);
        row.appendChild(label);
      });
      var area = el("div", "sig-area");
      if (m.sig) {
        var img = el("img", "sig-pad");
        img.src = m.sig.src;
        img.alt = "Signature of " + (m.name || "crew member");
        area.appendChild(img);
        area.appendChild(el("span", "sig-done", "Signed at " + m.signedAt));
        var again = el("button", "btn ghost small", "Sign again");
        again.type = "button";
        again.addEventListener("click", function () { m.sig = null; m.signedAt = ""; save(); renderCrew(); });
        area.appendChild(again);
      } else {
        var when = el("span", "sig-done");
        // Each stroke updates the stored signature, so a signature can take several strokes.
        area.appendChild(Shared.signaturePad(function (sig) {
          m.sig = sig;
          if (!m.signedAt) m.signedAt = nowTime();
          save();
          when.textContent = "Signed at " + m.signedAt;
        }));
        area.appendChild(when);
        var clear = el("button", "btn ghost small", "Clear");
        clear.type = "button";
        clear.addEventListener("click", function () { m.sig = null; m.signedAt = ""; save(); renderCrew(); });
        area.appendChild(clear);
      }
      var remove = el("button", "btn ghost small", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove " + (m.name || "crew member " + (mi + 1)));
      remove.addEventListener("click", function () { chk.crew.splice(mi, 1); save(); renderCrew(); });
      area.appendChild(remove);
      row.appendChild(area);
      list.appendChild(row);
    });
  }

  $("addCrew").addEventListener("click", function () {
    chk.crew.push({ name: "", grade: "", sig: null, signedAt: "" });
    save();
    renderCrew();
    var names = $("crewList").querySelectorAll(".crew-row input");
    names[names.length - 2].focus();
  });

  /* ---------------- vehicle ---------------- */
  function fill() {
    renderPhotos();
    renderCrew();
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
    note.dataset.key = chk.sections.indexOf(sec) + "-" + ii;
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
        // Choosing or leaving "Defect" shows or hides the photo button, so the row is redrawn.
        if ((item.status === "defect") !== !!row.querySelector(".defect-photos") && !item.photos.length) {
          var key = note.dataset.key;
          render();
          note = document.querySelector('.item-note[data-key="' + key + '"]');
        }
        if (item.status === "defect" && !item.note && note) note.focus();
      });
      group.appendChild(b);
    });
    row.appendChild(group);
    row.appendChild(note);
    showNote();

    // A defect can carry up to three photos.
    if (item.status === "defect" || item.photos.length) {
      var shots = el("div", "defect-photos");
      item.photos.forEach(function (p, pi) {
        var thumb = el("div", "thumb"), img = el("img");
        img.src = p.src;
        img.alt = "Photo of the defect: " + item.name;
        thumb.appendChild(img);
        var x = el("button", "icon-btn del", "\u00d7");
        x.type = "button";
        x.setAttribute("aria-label", "Remove photo " + (pi + 1) + " of " + item.name);
        x.addEventListener("click", function () { item.photos.splice(pi, 1); save(); render(); });
        thumb.appendChild(x);
        shots.appendChild(thumb);
      });
      if (item.photos.length < DEFECT_PHOTOS) {
        var input = photoPicker(function (photo) {
          if (!photo) return;
          item.photos.push(photo);
          saveOrUndo(function () { item.photos.pop(); }, "photoNote");
          render();
        });
        input.setAttribute("aria-label", "Photo of the defect: " + item.name);
        var add = el("button", "btn ghost small", "Add photo");
        add.type = "button";
        add.addEventListener("click", function () { input.click(); });
        shots.appendChild(add);
        shots.appendChild(input);
      }
      row.appendChild(shots);
    }
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
          sec.items.push({ name: input.value.trim(), status: "", note: "", photos: [] });
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

  /* ---------------- QR stickers ---------------- */
  /*
   * The vehicle and its checklist travel in the link itself, after the "#", which
   * the browser never sends to the website. Compressed where the browser can,
   * to keep the code small enough to scan from a sticker.
   */
  function vehicleLink() {
    var payload = {
      callsign: chk.callsign.trim(), reg: chk.reg.trim(), makeModel: chk.makeModel.trim(),
      sections: chk.sections.map(function (s) { return [s.name, s.items.map(function (i) { return i.name; })]; })
    };
    return Shared.link(payload);
  }
  window.VehicleCheckLink = vehicleLink;   // for the tests

  function readLink(hash) {
    return Shared.readLink(hash).then(function (p) {
      if (!isObj(p) || !Array.isArray(p.sections)) return null;
      return {
        callsign: str(p.callsign), reg: str(p.reg), makeModel: str(p.makeModel),
        sections: p.sections.filter(Array.isArray).map(function (s) {
          return { name: str(s[0]), items: (Array.isArray(s[1]) ? s[1] : []).map(function (n) {
            return { name: str(n), status: "", note: "", photos: [] };
          }) };
        })
      };
    });
  }

  function hasResults() {
    return chk.sections.some(function (s) { return s.items.some(function (i) { return i.status; }); });
  }

  /* Opened from a vehicle's sticker: today's check for that vehicle. */
  function applyLink(v) {
    var same = v.reg.toLowerCase() === chk.reg.trim().toLowerCase() &&
      v.callsign.toLowerCase() === chk.callsign.trim().toLowerCase();
    var name = v.reg || v.callsign || "this vehicle";
    if (same && chk.date === today() && hasResults()) {
      message("scanResult", "good", "Carrying on with today\u2019s check of " + name + ".");
      return;
    }
    if (hasResults() && !same && !confirm("Start a check of " + name + "? The check in progress for " +
      (chk.reg || chk.callsign || "another vehicle") + " is replaced. Save it first if you want it.")) return;
    ["callsign", "reg", "makeModel"].forEach(function (f) { chk[f] = v[f]; });
    chk.sections = v.sections;
    chk.photos = {};
    chk.crew = [];
    ["mileage", "fuel", "checkedBy", "reportedTo"].forEach(function (f) { chk[f] = ""; });
    chk.fit = "";
    chk.date = today();
    chk.time = nowTime();
    save();
    fill();
    render();
    message("scanResult", "good", "Ready to check " + name + ". Fill in the mileage and fuel, then the checks.");
  }

  $("stickerBtn").addEventListener("click", function () {
    if (!chk.reg.trim() && !chk.callsign.trim()) {
      message("stickerResult", "bad", "Enter the vehicle\u2019s registration or callsign first.");
      return;
    }
    vehicleLink().then(function (url) {
      window.VehicleCheckPDF.stickers(chk, url).save("QR-stickers-" + fileBase().replace(/-\d{4}-\d{2}-\d{2}$/, "") + ".pdf");
      message("stickerResult", "good", "Downloaded six stickers for " + (chk.reg || chk.callsign) + ".");
    });
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
    if (!confirm("Start a new check? The results, photos, crew, mileage, fuel, defects and sign-off are cleared; the " +
      "vehicle and your checklist are kept. Save this check first if you want it.")) return;
    chk.sections.forEach(function (s) { s.items.forEach(function (i) { i.status = ""; i.note = ""; i.photos = []; }); });
    chk.photos = {};
    chk.crew = [];
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
  /* Opened from a sticker, or a sticker scanned while the tool was already open. */
  function fromLink() {
    if (!location.hash) return;
    readLink(location.hash).then(function (v) {
      // Take the vehicle out of the address, so a reload does not start the check again.
      history.replaceState(null, "", location.href.split("#")[0]);
      showTab("vehicle");
      if (v) applyLink(v);
      else message("scanResult", "bad", "That link could not be read. Start the check by hand below.");
    });
  }
  window.addEventListener("hashchange", fromLink);
  fromLink();
})();
