/* Company profile: edits one set of company details and saves them as the
   company file the Drug Bag Tracker and Bag Tracker import. Kept in
   localStorage on this device. */
(function () {
  "use strict";

  var KEY = "company-profile/v1";
  // The Drug Bag Tracker's own company-file format, so it imports unchanged.
  var FORMAT = "drug-bag-tracker/company";
  var TEXT = ["companyName", "companyPhone", "companyAddress", "cqcNumber"];
  var LOGO_MAX_EDGE = 480;      // px, same limits as the trackers use
  var LOGO_MAX_BYTES = 400000;  // keep localStorage well inside its quota
  var $ = function (id) { return document.getElementById(id); };

  var profile = {};

  /* Keeps only what a company file may hold, whatever JSON.parse returned. */
  function clean(raw) {
    var out = { cqcRegistered: false };
    if (!raw || typeof raw !== "object") return out;
    TEXT.forEach(function (f) { out[f] = typeof raw[f] === "string" ? raw[f] : ""; });
    out.cqcRegistered = raw.cqcRegistered === true;
    if (typeof raw.logo === "string" && raw.logo.indexOf("data:image/") === 0) {
      out.logo = raw.logo; out.logoW = +raw.logoW || 0; out.logoH = +raw.logoH || 0;
    }
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); return true; } catch (e) { return false; }
  }

  function load() {
    try { profile = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { profile = clean(null); }
  }

  function fill() {
    TEXT.forEach(function (f) { $(f).value = profile[f] || ""; });
    $("cqcRegistered").checked = profile.cqcRegistered;
    $("f-cqcNumber").hidden = !profile.cqcRegistered;
    showLogo();
  }

  function message(id, kind, text) {
    $(id).className = "notice " + kind;
    $(id).textContent = text;
    $(id).hidden = false;
  }

  TEXT.forEach(function (f) {
    $(f).addEventListener("input", function () { profile[f] = $(f).value; save(); });
  });
  $("cqcRegistered").addEventListener("change", function () {
    profile.cqcRegistered = this.checked;
    $("f-cqcNumber").hidden = !this.checked;
    save();
  });

  /* ---------------- logo ---------------- */
  function showLogo() {
    $("logoPreview").hidden = !profile.logo;
    $("logoRemove").hidden = !profile.logo;
    if (profile.logo) $("logoImg").src = profile.logo;
    $("logoBtn").textContent = profile.logo ? "Replace image…" : "Choose image…";
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
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // PNG keeps transparency; fall back to JPEG if that comes out too big.
        var data = canvas.toDataURL("image/png");
        if (data.length > LOGO_MAX_BYTES) data = canvas.toDataURL("image/jpeg", 0.85);
        if (data.length > LOGO_MAX_BYTES) {
          logoMessage("bad", "That image is too large to store. Try a smaller one.");
          return;
        }
        profile.logo = data; profile.logoW = w; profile.logoH = h;
        showLogo();
        var ok = save();
        logoMessage(ok ? "good" : "bad", ok
          ? "Logo set." : "Logo set, but this browser would not store it — save the profile to keep it.");
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
    delete profile.logo; delete profile.logoW; delete profile.logoH;
    save(); showLogo(); logoMessage("", "PNG or JPEG, printed at the top of each document.");
  });

  /* ---------------- save / open ---------------- */
  function fileName() {
    var name = (profile.companyName || "").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return "Company-" + (name || "details") + ".json";
  }

  function download() {
    var missing = [];
    if (!(profile.companyName || "").trim()) missing.push("the company name");
    if (profile.cqcRegistered && !(profile.cqcNumber || "").trim()) missing.push("the CQC registration number");
    if (missing.length) {
      message("saveResult", "bad", "Enter " + missing.join(" and ") + " before saving.");
      $("saveResult").scrollIntoView({ block: "nearest" });
      return;
    }
    var out = { format: FORMAT, version: 1 };
    TEXT.forEach(function (f) { out[f] = (profile[f] || "").trim(); });
    out.cqcRegistered = profile.cqcRegistered;
    if (!out.cqcRegistered) out.cqcNumber = "";
    if (profile.logo) { out.logo = profile.logo; out.logoW = profile.logoW; out.logoH = profile.logoH; }

    var url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    message("saveResult", "good", "Saved as " + fileName() + ". Import it into each tool with “Import company details”.");
  }

  $("saveBtn").addEventListener("click", download);
  $("saveTop").addEventListener("click", download);

  /* Opens a company file, or the company half of any tracker export. */
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
      if (parsed && typeof parsed === "object" && parsed.format !== FORMAT && parsed.setup && typeof parsed.setup === "object") {
        parsed = parsed.setup;
      }
      if (!parsed || typeof parsed !== "object" || typeof parsed.companyName !== "string") {
        message("openResult", "bad", "“" + file.name + "” does not contain company details. Nothing has been changed.");
        return;
      }
      profile = clean(parsed);
      save(); fill();
      message("openResult", "good", "Opened company details for " + (profile.companyName || "this organisation") + ".");
    };
    reader.readAsText(file);
  });

  $("resetAll").addEventListener("click", function () {
    if (!confirm("Clear the company profile on this device? Save it first if you want to keep it.")) return;
    profile = clean(null);
    save(); fill();
    $("saveResult").hidden = true; $("openResult").hidden = true;
  });

  load();
  fill();
})();
