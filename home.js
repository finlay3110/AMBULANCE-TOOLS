/* Home page: back up and restore the saved work of every tool in this browser. */
(function () {
  "use strict";

  var FORMAT = "ambulance-tools/backup";
  // Each tool keeps its work under its own prefix. Nothing else in this
  // browser's storage for the site is read or written.
  var TOOLS = [
    ["company-profile/", "Company Profile"],
    ["drug-bag-tracker/", "Drug Bag Tracker"],
    ["bag-tracker/", "Bag Tracker"],
    ["deployment-maker/", "Deployment Maker"]
  ];
  var $ = function (id) { return document.getElementById(id); };

  function toolOf(key) {
    for (var i = 0; i < TOOLS.length; i++) if (key.indexOf(TOOLS[i][0]) === 0) return TOOLS[i][1];
    return null;
  }

  /* "Company Profile, Bag Tracker": each tool once, in the home page's order. */
  function toolNames(keys) {
    return TOOLS.map(function (t) { return t[1]; }).filter(function (name) {
      return keys.some(function (k) { return toolOf(k) === name; });
    }).join(", ");
  }

  /* When the last backup was made here. Not itself backed up: it is about this browser. */
  var LAST_KEY = "ambulance-tools/last-backup";
  var REMIND_DAYS = 30;

  function hasWork() {
    try {
      for (var i = 0; i < localStorage.length; i++) if (toolOf(localStorage.key(i))) return true;
    } catch (e) { /* storage unreadable: nothing to remind about */ }
    return false;
  }

  /* A nudge when there is work that has never been backed up, or not for a month. */
  function showBackupStatus() {
    var box = $("backupStatus"), last = null;
    try { last = Date.parse(localStorage.getItem(LAST_KEY)); } catch (e) { last = NaN; }
    if (!hasWork()) { box.hidden = true; return; }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var day = new Date(last); day.setHours(0, 0, 0, 0);
    var days = isNaN(last) ? -1 : Math.round((today - day) / 86400000);
    box.hidden = false;
    if (days < 0) {
      box.className = "notice warn";
      box.textContent = "You have not backed up yet. Your work is only in this browser, so download a backup " +
        "to keep it safe.";
    } else if (days >= REMIND_DAYS) {
      box.className = "notice warn";
      box.textContent = "Your last backup was " + days + " days ago. Download a new one to keep recent work safe.";
    } else {
      box.className = "notice good";
      box.textContent = "Last backed up " + (days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago") + ".";
    }
  }

  function message(kind, text) {
    $("backupResult").className = "notice " + kind;
    $("backupResult").textContent = text;
    $("backupResult").hidden = false;
  }

  $("backupBtn").addEventListener("click", function () {
    var data = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (toolOf(k)) data[k] = localStorage.getItem(k);
      }
    } catch (e) {
      message("bad", "This browser would not let the page read its saved work.");
      return;
    }
    var keys = Object.keys(data);
    if (!keys.length) {
      message("bad", "There is no saved work in this browser to back up yet.");
      return;
    }
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = "Ambulance-Tools-backup-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json";
    var backup = { format: FORMAT, version: 1, saved: d.toISOString(), data: data };
    var url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    message("good", "Saved " + name + " with the work from: " + toolNames(keys) + ". Keep it somewhere safe.");
    try { localStorage.setItem(LAST_KEY, d.toISOString()); } catch (e) { /* the reminder just stays */ }
    showBackupStatus();
  });

  $("restoreBtn").addEventListener("click", function () { $("restoreFile").click(); });
  $("restoreFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { message("bad", "That file could not be read."); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      var data = parsed && parsed.format === FORMAT && parsed.data && typeof parsed.data === "object" ? parsed.data : null;
      // Only a tool's own entries, as text: the file cannot write anything else.
      var keys = data ? Object.keys(data).filter(function (k) { return toolOf(k) && typeof data[k] === "string"; }) : [];
      if (!keys.length) {
        message("bad", "“" + file.name + "” is not a backup made here. Nothing has been changed.");
        return;
      }
      if (!confirm("Restore “" + file.name + "”? It replaces the saved work in this browser for: " +
        toolNames(keys) + ". Tools not in the backup are left as they are.")) return;
      try {
        keys.forEach(function (k) { localStorage.setItem(k, data[k]); });
      } catch (e) {
        message("bad", "This browser would not store all of the backup (its storage may be full, or this may be " +
          "a private window). Some tools may have been restored and others not.");
        return;
      }
      message("good", "Restored: " + toolNames(keys) + ". Open a tool to carry on from the backup.");
      showBackupStatus();
    };
    reader.readAsText(file);
  });

  showBackupStatus();
})();
