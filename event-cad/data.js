/* Event CAD: the data, shared by the CAD page and the PDFs.
   Lists, cleaning (storage and opened files are not trusted), unit status,
   alerts and the end-of-event statistics. Needs ../shared.js. */
(function (global) {
  "use strict";

  var KEY = "event-cad/v1";
  var FORMAT = "event-cad/cad";
  var SETUP_FORMAT = "event-cad/setup";

  // MPDS chief complaint protocols, by number.
  var MPDS = [
    [1, "Abdominal pain/problems"], [2, "Allergies/envenomations (stings, bites)"], [3, "Animal bites/attacks"],
    [4, "Assault/sexual assault"], [5, "Back pain (non-traumatic)"], [6, "Breathing problems"],
    [7, "Burns (scalds)/explosion"], [8, "Carbon monoxide/inhalation/HAZMAT/CBRN"],
    [9, "Cardiac or respiratory arrest/death"], [10, "Chest pain/chest discomfort (non-traumatic)"],
    [11, "Choking"], [12, "Convulsions/fitting"], [13, "Diabetic problems"],
    [14, "Drowning/near drowning/diving/SCUBA accident"], [15, "Electrocution/lightning"],
    [16, "Eye problems/injuries"], [17, "Falls"], [18, "Headache"], [19, "Heart problems/A.I.C.D."],
    [20, "Heat/cold exposure"], [21, "Haemorrhage/lacerations"],
    [22, "Inaccessible incident/other entrapments (non-traffic)"], [23, "Overdose/poisoning (ingestion)"],
    [24, "Pregnancy/childbirth/miscarriage"], [25, "Psychiatric/abnormal behaviour/suicide attempt"],
    [26, "Sick person (specific diagnosis)"], [27, "Stab/gunshot/penetrating trauma"],
    [28, "Stroke (CVA)/transient ischaemic attack (TIA)"], [29, "Traffic/transportation incidents"],
    [30, "Traumatic injuries (specific)"], [31, "Unconscious/fainting (near)"], [32, "Unknown problem (person down)"],
    [33, "Transfer/interfacility/palliative care"], [34, "Automatic crash notification (A.C.N.)"],
    [35, "Healthcare professional admission"], [36, "Pandemic/epidemic/outbreak"],
    [37, "Interfacility evaluation/transfer"]
  ];
  var CATEGORIES = [[1, "Life-threatening"], [2, "Emergency"], [3, "Urgent"], [4, "Less urgent"],
    [5, "Hear and treat / referral"]];
  var OUTCOMES = ["Treated and discharged on scene", "Conveyed to treatment centre", "Conveyed to hospital",
    "Handed to NHS ambulance", "Refused care", "Advice only", "No patient found / stood down"];
  var TO_HOSPITAL = ["Conveyed to hospital", "Handed to NHS ambulance"];
  var SOURCES = ["Radio", "Phone", "Walk-up", "Steward/Security"];
  var SEXES = ["Male", "Female", "Not known"];
  var UNIT_TYPES = ["Ambulance", "Response car", "Foot team", "Cycle team", "Other"];
  var PLACE_KINDS = [["standby", "Standby point"], ["poi", "Point of interest"], ["tc", "Treatment centre"]];
  // A unit's steps on a call, in order. Stood down can come at any point instead of Clear.
  var STEPS = [["assigned", "Assigned"], ["enroute", "En route"], ["onscene", "On scene"],
    ["moving", "Moving patient"], ["atdest", "At destination"], ["clear", "Clear"]];
  var FLAGS = [["police", "Police involved"], ["safeguarding", "Safeguarding concern"],
    ["vulnerable", "Lost or vulnerable person"]];
  var ATMIST = [["a", "Age"], ["t", "Time of incident"], ["m", "Mechanism"], ["i", "Injuries"], ["s", "Signs"],
    ["tx", "Treatment"]];
  var METHANE = [["m", "Major incident", "Declared or on standby"], ["e", "Exact location", "Where, as precisely as possible"],
    ["t", "Type of incident", "What happened"], ["h", "Hazards", "Present and possible"],
    ["a", "Access", "Routes in and out, rendezvous point"], ["n", "Number of casualties", "How many, and how badly hurt"],
    ["e2", "Emergency services", "Present, and needed"]];

  // One-tap updates for a call's log; edited in Setup.
  var PHRASES = ["Crew on scene, assessing", "Patient stable", "Patient conveyed", "Crew request backup",
    "Police requested", "Security requested", "Patient refused care", "Crew clear, returning to standby"];
  var HOSPITAL_STATUS = [["", "Normal"], ["pressure", "Under pressure"], ["divert", "On divert"]];
  var TRIAGE = [["p1", "P1"], ["p2", "P2"], ["p3", "P3"], ["dead", "Dead"]];
  // How each patient presented, in the groupings event medical reports use.
  var PRESENTATIONS = ["Minor injury", "Major injury", "Medical", "Cardiac / chest pain", "Breathing", "Fit / neurological",
    "Mental health", "Heat / cold", "Allergic reaction", "Pregnancy", "Intoxication", "Other"];
  var AGE_BANDS = [["Under 18", 0, 17], ["18 to 24", 18, 24], ["25 to 39", 25, 39], ["40 to 59", 40, 59], ["60 and over", 60, 150]];

  /* ---------------- times: local "YYYY-MM-DDTHH:MM", as a datetime-local box gives it ---------------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function local(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" +
      pad(d.getMinutes());
  }
  function stamp(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:\d\d(\.\d+)?)?$/.test(v) ? v.slice(0, 16) : "";
  }
  function now() { return local(new Date()); }
  function ms(s) { return s ? new Date(s).getTime() : NaN; }   // no "Z", so the device's own time zone
  function mins(a, b) { return (ms(b) - ms(a)) / 60000; }
  function addMins(s, m) { return local(new Date(ms(s) + m * 60000)); }
  function hhmm(s) { return s ? s.slice(11, 16) : ""; }
  function ukStamp(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) + " " + hhmm(s) : ""; }
  function pad3(n) { var s = String(n); return s.length < 3 ? ("00" + s).slice(-3) : s; }

  /* Minutes as "7 min", "7.5 min" or "1 h 05 min"; a dash for nothing. */
  function dur(m) {
    if (m === null || m === undefined || !isFinite(m)) return "—";
    if (m < 60) return (Math.round(m * 10) / 10) + " min";
    var r = Math.round(m);
    return Math.floor(r / 60) + " h " + pad(r % 60) + " min";
  }

  /* ---------------- what3words ---------------- */
  function w3w(text) { return String(text || "").trim().replace(/^\/+/, "").replace(/\s+/g, "").toLowerCase(); }
  function isW3w(words) { return /^\p{L}+\.\p{L}+\.\p{L}+$/u.test(words); }

  /* ---------------- a blank CAD, and its parts ---------------- */
  function blank() {
    return {
      company: null,
      event: { name: "", venue: "", start: "", end: "", lead: "", control: "", crowd: 0 },
      units: [], places: [], hospitals: [],
      settings: { unassignedMins: 5, onSceneMins: 20, targets: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },   // 0: no target
        phrases: PHRASES.slice(), mapGrid: { cols: 0, rows: 0 } },   // the site map's squares: letters across, numbers down
      controller: "",
      calls: [], tc: [], log: [], methane: [], casualties: [],
      conditions: [],   // hourly attendance and weather
      persons: [],      // lost and vulnerable persons
      compare: null,    // another event's figures, for the report
      hospitalStatus: {},          // by hospital name: { status, note, since }
      finalised: "", finalisedBy: "",   // set once the event is locked
      exportedAt: "",   // when the CAD was last exported to a file
      seq: 0   // the last number used for a unit or place id
    };
  }
  function newCall(id, received, controller) {
    var c = { id: id, received: received, controller: controller || "", source: "", reportedBy: "",
      place: "", locText: "", w3w: "", grid: "", protocol: 0, category: 0, details: "", flags: {}, policeRef: "",
      duplicateOf: 0, patients: [], units: [], log: [], outcome: "", closed: "",
      nhs: { requested: "", cad: "", category: 0, arrived: "", handover: "" } };
    FLAGS.forEach(function (f) { c.flags[f[0]] = false; });
    return c;
  }
  function newAssignment(unitId, at) {
    var a = { unit: unitId, stooddown: "", dest: "", hospital: "", blue: false, atmist: {}, eta: "", passedTo: "",
      via: "", nhsCad: "" };
    STEPS.forEach(function (s) { a[s[0]] = ""; });
    ATMIST.forEach(function (f) { a.atmist[f[0]] = ""; });
    a.assigned = at;
    return a;
  }

  /* ---------------- cleaning ---------------- */
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v.filter(isObj) : []; }
  function str(v) { return typeof v === "string" ? v : ""; }
  function int(v, lo, hi) { var n = Number(v); return Math.floor(n) === n && n >= lo && n <= hi ? n : 0; }
  function oneOf(v, list) { return list.indexOf(v) >= 0 ? v : ""; }
  function uid(v) { return typeof v === "string" && /^u\d+$/.test(v) ? v : ""; }
  function pid(v) { return typeof v === "string" && /^p\d+$/.test(v) ? v : ""; }

  function cleanAssignment(raw) {
    var a = newAssignment(uid(raw.unit), stamp(raw.assigned));
    STEPS.forEach(function (s) { a[s[0]] = stamp(raw[s[0]]); });
    a.stooddown = stamp(raw.stooddown);
    a.dest = raw.dest === "hospital" ? "hospital" : pid(raw.dest);
    ["hospital", "eta", "passedTo", "nhsCad"].forEach(function (f) { a[f] = str(raw[f]); });
    a.blue = raw.blue === true;
    a.via = oneOf(raw.via, ["hospital", "nhs"]);
    ATMIST.forEach(function (f) { a.atmist[f[0]] = isObj(raw.atmist) ? str(raw.atmist[f[0]]) : ""; });
    return a;
  }

  function cleanCall(raw) {
    var c = newCall(int(raw.id, 1, 99999), stamp(raw.received), str(raw.controller));
    ["reportedBy", "locText", "grid", "details", "policeRef"].forEach(function (f) { c[f] = str(raw[f]); });
    c.w3w = w3w(str(raw.w3w));
    c.source = oneOf(raw.source, SOURCES);
    c.place = pid(raw.place);
    c.protocol = int(raw.protocol, 1, MPDS.length);
    c.category = int(raw.category, 1, 5);
    FLAGS.forEach(function (f) { c.flags[f[0]] = isObj(raw.flags) && raw.flags[f[0]] === true; });
    c.duplicateOf = int(raw.duplicateOf, 1, 99999);
    c.patients = arr(raw.patients).map(function (p) {
      return { age: str(p.age), sex: oneOf(p.sex, SEXES), prf: str(p.prf), outcome: oneOf(p.outcome, OUTCOMES),
        type: oneOf(p.type, PRESENTATIONS), alcohol: p.alcohol === true };
    });
    c.units = arr(raw.units).map(cleanAssignment).filter(function (a) { return a.unit && a.assigned; });
    c.log = cleanLog(raw.log);
    c.outcome = oneOf(raw.outcome, OUTCOMES);
    c.closed = stamp(raw.closed);
    var n = isObj(raw.nhs) ? raw.nhs : {};
    c.nhs = { requested: stamp(n.requested), cad: str(n.cad), category: int(n.category, 1, 5), arrived: stamp(n.arrived),
      handover: stamp(n.handover) };
    return c;
  }

  function cleanLog(list) {
    return arr(list).map(function (e) { return { time: stamp(e.time), text: str(e.text), by: str(e.by) }; })
      .filter(function (e) { return e.time && e.text; });
  }

  function clean(raw) {
    var out = blank();
    if (!isObj(raw)) return out;
    out.company = global.Shared.company(raw.company);
    var ev = isObj(raw.event) ? raw.event : {};
    ["name", "venue", "lead", "control"].forEach(function (f) { out.event[f] = str(ev[f]); });
    out.event.start = stamp(ev.start);
    out.event.end = stamp(ev.end);
    out.event.crowd = int(ev.crowd, 0, 10000000);
    var s = isObj(raw.settings) ? raw.settings : {};
    out.settings.unassignedMins = int(s.unassignedMins, 1, 600) || 5;
    out.settings.onSceneMins = int(s.onSceneMins, 1, 600) || 20;
    CATEGORIES.forEach(function (k) { out.settings.targets[k[0]] = int(isObj(s.targets) ? s.targets[k[0]] : 0, 0, 1440); });
    if (Array.isArray(s.phrases)) {
      out.settings.phrases = s.phrases.filter(function (p) { return typeof p === "string" && p.trim(); })
        .map(function (p) { return p.trim(); }).slice(0, 20);
    }
    var g = isObj(s.mapGrid) ? s.mapGrid : {};
    out.settings.mapGrid = { cols: int(g.cols, 0, 26), rows: int(g.rows, 0, 99) };
    out.finalised = stamp(raw.finalised);
    out.finalisedBy = str(raw.finalisedBy);
    out.exportedAt = stamp(raw.exportedAt);
    if (isObj(raw.hospitalStatus)) {
      Object.keys(raw.hospitalStatus).forEach(function (name) {
        var h = raw.hospitalStatus[name];
        if (isObj(h) && oneOf(h.status, ["pressure", "divert"])) {
          out.hospitalStatus[name] = { status: h.status, note: str(h.note), since: stamp(h.since) };
        }
      });
    }
    out.controller = str(raw.controller);
    out.seq = int(raw.seq, 0, 1e9);
    // Ids must be unique: a missing or repeated one gets a new number.
    var seen = {};
    function fresh(id, prefix) {
      var n = Number(id.slice(1));
      if (id && !seen[id]) { seen[id] = true; out.seq = Math.max(out.seq, n); return id; }
      return null;
    }
    var later = [];
    out.places = arr(raw.places).map(function (p) {
      var place = { id: fresh(pid(p.id)), name: str(p.name), kind: oneOf(p.kind, ["standby", "poi", "tc"]) || "poi",
        grid: str(p.grid), w3w: w3w(str(p.w3w)) };
      if (!place.id) later.push(place);
      return place;
    });
    out.units = arr(raw.units).map(function (u) {
      var unit = { id: fresh(uid(u.id)), callsign: str(u.callsign), type: oneOf(u.type, UNIT_TYPES) || "Other",
        reg: str(u.reg), at: pid(u.at),
        staff: arr(u.staff).map(function (p) { return { name: str(p.name), grade: str(p.grade) }; }),
        history: arr(u.history).map(function (h) {
          return { kind: oneOf(h.kind, ["break", "unavailable", "offduty"]) || "unavailable", start: stamp(h.start), until: stamp(h.until),
            end: stamp(h.end), reason: str(h.reason) };
        }).filter(function (h) { return h.start; }),
        crewLog: arr(u.crewLog).map(function (x) { return { time: stamp(x.time), off: str(x.off), on: str(x.on), by: str(x.by) }; })
          .filter(function (x) { return x.time; }) };
      if (!unit.id) later.push(unit);
      return unit;
    });
    later.forEach(function (x) { out.seq += 1; x.id = (out.units.indexOf(x) >= 0 ? "u" : "p") + out.seq; });
    out.hospitals = (Array.isArray(raw.hospitals) ? raw.hospitals : []).filter(function (h) { return typeof h === "string"; });
    var ids = {};
    out.calls = arr(raw.calls).map(cleanCall).filter(function (c) {
      if (!c.id || !c.received || ids[c.id]) return false;
      ids[c.id] = true;
      return true;
    });
    out.tc = arr(raw.tc).map(function (t) {
      return { time: stamp(t.time), place: pid(t.place), count: int(t.count, 0, 1000000), notes: str(t.notes), by: str(t.by) };
    }).filter(function (t) { return t.time; });
    out.log = cleanLog(raw.log);
    out.methane = arr(raw.methane).map(function (m) {
      var x = { time: stamp(m.time), by: str(m.by), passedTo: str(m.passedTo) };
      METHANE.forEach(function (f) { x[f[0]] = str(m[f[0]]); });
      return x;
    }).filter(function (m) { return m.time; });
    out.casualties = arr(raw.casualties).map(function (c) {
      var x = { time: stamp(c.time), note: str(c.note), by: str(c.by) };
      TRIAGE.forEach(function (t) { x[t[0]] = int(c[t[0]], 0, 100000); });
      return x;
    }).filter(function (c) { return c.time; });
    out.conditions = arr(raw.conditions).map(function (c) {
      return { time: stamp(c.time), crowd: int(c.crowd, 0, 10000000), temp: str(c.temp), weather: str(c.weather), by: str(c.by) };
    }).filter(function (c) { return c.time; });
    var seenPerson = {};
    out.persons = arr(raw.persons).map(function (p) {
      var x = { id: int(p.id, 1, 99999), time: stamp(p.time), found: stamp(p.found), closed: stamp(p.closed), call: int(p.call, 1, 99999) };
      ["desc", "name", "lastSeen", "reportedBy", "foundAt", "handedTo", "by"].forEach(function (f) { x[f] = str(p[f]); });
      return x;
    }).filter(function (p) { return p.id && p.time && !seenPerson[p.id] && (seenPerson[p.id] = true); });
    out.compare = cleanCompare(raw.compare);
    // Oldest first: the hourly count and the alerts read the latest entry from the end.
    [out.tc, out.log, out.methane, out.casualties, out.conditions, out.persons].forEach(function (list) { list.sort(byTime); });
    return out;
  }
  function byTime(a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; }

  /* The setup alone, to reuse for another event: no calls, counts, logs or breaks. */
  function setupOf(cad) {
    return {
      format: SETUP_FORMAT, version: 1, company: cad.company, event: cad.event,
      units: cad.units.map(function (u) { return Object.assign({}, u, { history: [], crewLog: [] }); }),
      places: cad.places, hospitals: cad.hospitals, settings: cad.settings, seq: cad.seq
    };
  }

  /* ---------------- looking things up ---------------- */
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function unitById(cad, id) { return find(cad.units, id); }
  function placeById(cad, id) { return find(cad.places, id); }
  function callById(cad, id) { return find(cad.calls, id); }
  function placeName(cad, id) { var p = placeById(cad, id); return p ? p.name : ""; }
  function protocolName(n) { return n ? (MPDS[n - 1] || [0, ""])[1] : ""; }
  function callsignOf(cad, id) { var u = unitById(cad, id); return u ? u.callsign || "Unnamed unit" : "Removed unit"; }

  function callPlace(cad, c) {
    return [placeName(cad, c.place), c.locText, c.grid ? "Grid " + c.grid : "", c.w3w ? "///" + c.w3w : ""]
      .filter(Boolean).join("  ·  ");
  }
  function destName(cad, a) {
    if (a.dest === "hospital") return (a.hospital || "Hospital") + (a.blue ? " (blue light)" : "");
    return placeName(cad, a.dest);
  }

  /* The last step a unit has reached on a call (Clear only when asked for). */
  function lastStep(a, withClear) {
    var last = null;
    STEPS.forEach(function (s) { if (a[s[0]] && (withClear || s[0] !== "clear")) last = s; });
    return last;
  }
  function finished(a) { return !!(a.clear || a.stooddown); }

  /* A break or unavailable time that has not ended. */
  function openPeriod(unit) {
    var h = unit.history[unit.history.length - 1];
    return h && !h.end ? h : null;
  }

  /* The call a unit is busy on, if any: its latest assignment not yet cleared. */
  function activeJob(cad, unitId) {
    var job = null;
    cad.calls.forEach(function (c) {
      c.units.forEach(function (a) {
        if (a.unit === unitId && !finished(a) && (!job || ms(a.assigned) >= ms(job.a.assigned))) job = { call: c, a: a };
      });
    });
    return job;
  }

  /* What a unit is doing now: code, label, where, since, and the call or break end. */
  function unitStatus(cad, unit, nowMs) {
    var job = activeJob(cad, unit.id);
    if (job) {
      var step = lastStep(job.a) || STEPS[0];
      var going = step[0] === "moving" || step[0] === "atdest";
      return { code: step[0], label: step[1], call: job.call.id, since: job.a[step[0]],
        where: (going ? destName(cad, job.a) : callPlace(cad, job.call)) || "" };
    }
    var p = openPeriod(unit);
    if (p && p.kind === "break") {
      var over = !!p.until && nowMs >= ms(p.until);
      return { code: over ? "breakover" : "break", label: over ? "Break over" : "On break", since: p.start,
        until: p.until, where: placeName(cad, unit.at) };
    }
    if (p && p.kind === "offduty") return { code: "offduty", label: "Off duty", since: p.start, where: placeName(cad, unit.at) };
    if (p) return { code: "unavailable", label: "Unavailable", since: p.start, until: p.until, where: p.reason };
    return { code: "available", label: "Available", since: "", where: placeName(cad, unit.at) };
  }

  /* ---------------- another event, to compare with ---------------- */
  var COMPARE = [["calls", "Calls"], ["patients", "Patients"], ["toHospital", "To hospital"],
    ["ppr", "Patients per 1,000 attendees"], ["tthr", "Hospital transfers per 1,000 attendees"],
    ["avg", "Average, received to first on scene (min)"], ["median", "Median, received to first on scene (min)"],
    ["target", "Calls within target (%)"], ["nhs", "NHS ambulances requested"], ["alcohol", "Patients with alcohol or drugs involved"],
    ["duplicates", "Duplicate calls"]];
  function cleanCompare(raw) {
    if (!isObj(raw) || !isObj(raw.figures)) return null;
    var out = { name: str(raw.name), start: stamp(raw.start), crowd: int(raw.crowd, 0, 10000000), figures: {} };
    COMPARE.forEach(function (f) {
      var n = raw.figures[f[0]];
      out.figures[f[0]] = typeof n === "number" && isFinite(n) && n >= 0 ? n : null;
    });
    return out;
  }
  /* The figures that the report compares, from a whole CAD. */
  function figures(cad) {
    var s = stats(cad), all = s.response[0], t = all && all.target;
    return { calls: s.calls, patients: s.patients, toHospital: s.toHospital, ppr: s.ppr, tthr: s.tthr,
      avg: all && all.callToScene ? all.callToScene.avg : null, median: all && all.callToScene ? all.callToScene.median : null,
      target: t ? t.met / t.n * 100 : null, nhs: s.nhs.length, alcohol: s.alcohol, duplicates: s.duplicates };
  }
  function compareFrom(cad) {
    return { name: cad.event.name, start: cad.event.start, crowd: cad.event.crowd, figures: figures(cad) };
  }

  /* A site map grid reference, such as "C4": letters across, numbers down. Null if it isn't one on this map. */
  function gridSquare(cad, ref) {
    var g = cad.settings.mapGrid, m = /^\s*([A-Za-z])\s*-?\s*(\d{1,2})\s*$/.exec(ref || "");
    if (!m || !g.cols || !g.rows) return null;
    var col = m[1].toUpperCase().charCodeAt(0) - 65, row = +m[2] - 1;
    return col < g.cols && row >= 0 && row < g.rows ? { col: col, row: row, key: String.fromCharCode(65 + col) + (row + 1) } : null;
  }

  /* A short situation report, for the radio or a message: since a time, or for the whole event. */
  function sitrep(cad, nowMs, sinceMs) {
    var all = cad.calls.filter(function (c) { return !c.duplicateOf; });
    var recent = sinceMs ? all.filter(function (c) { return ms(c.received) >= sinceMs; }) : all;
    var pts = function (list) { return flat(list.map(function (c) { return c.patients; })); };
    var hosp = function (list) { return pts(list).filter(function (p) { return TO_HOSPITAL.indexOf(p.outcome) >= 0; }).length; };
    var total = function (n) { return sinceMs ? " (event total " + n + ")" : ""; };
    var resp = summary(recent.map(function (c) { return (firstOnScene(c) - ms(c.received)) / 60000; }));
    var lines = ["SITREP: " + (cad.event.name || "the event") + ", " + hhmm(local(new Date(nowMs))) +
      (sinceMs ? ", since " + hhmm(local(new Date(sinceMs))) : ", whole event")];
    lines.push("Calls: " + recent.length + total(all.length) + "; " + all.filter(function (c) { return !c.closed; }).length + " open now.");
    lines.push("Patients: " + pts(recent).length + total(pts(all).length) + "; to hospital: " + hosp(recent) + total(hosp(all)) + ".");
    if (resp) lines.push("Call to first unit on scene: average " + dur(resp.avg) + ", longest " + dur(resp.max) + ".");
    var states = cad.units.map(function (u) { return [u, unitStatus(cad, u, nowMs)]; });
    var free = states.filter(function (x) { return x[1].code === "available"; }).length;
    lines.push("Units: " + free + " of " + cad.units.length + " available." + states.filter(function (x) {
      return x[1].code !== "available";
    }).map(function (x) {
      return " " + (x[0].callsign || "Unnamed unit") + ": " + x[1].label.toLowerCase() + (x[1].call ? " (call " + pad3(x[1].call) + ")" : "") + ".";
    }).join(""));
    var centres = tcCentres(cad).map(function (p) {
      var last = cad.tc.filter(function (t) { return t.place === p.id; }).pop();
      return last ? p.name + " " + last.count + " (" + hhmm(last.time) + ")" : "";
    }).filter(Boolean);
    if (!centres.length && cad.tc.length) centres = ["" + cad.tc[cad.tc.length - 1].count + " (" + hhmm(cad.tc[cad.tc.length - 1].time) + ")"];
    if (centres.length) lines.push("Treatment centres: " + centres.join(", ") + ".");
    var hospitals = Object.keys(cad.hospitalStatus).map(function (h) {
      return h + " " + (cad.hospitalStatus[h].status === "divert" ? "on divert" : "under pressure");
    });
    if (hospitals.length) lines.push("Hospitals: " + hospitals.join(", ") + ".");
    var missing = cad.persons.filter(function (p) { return !p.found && !p.closed; });
    if (missing.length) lines.push("Missing persons: " + missing.map(function (p) { return p.desc; }).join("; ") + ".");
    var m = cad.methane[cad.methane.length - 1], cas = cad.casualties[cad.casualties.length - 1];
    if (m) lines.push("Major incident " + m.m.toLowerCase() + " at " + hhmm(m.time) + ": " + m.e + ".");
    if (cas) lines.push("Casualties at " + hhmm(cas.time) + ": " + TRIAGE.map(function (t) { return t[1] + " " + cas[t[0]]; }).join(", ") + ".");
    if (cad.controller) lines.push("Controller: " + cad.controller + ".");
    return lines.join("\n");
  }

  /* A warning for a hospital that is on divert or under pressure, or "". */
  function hospitalWarning(cad, name) {
    var key = String(name || "").trim().toLowerCase(), found = "";
    Object.keys(cad.hospitalStatus).forEach(function (h) { if (h.trim().toLowerCase() === key && key) found = h; });
    if (!found) return "";
    var s = cad.hospitalStatus[found];
    return found + " is " + (s.status === "divert" ? "ON DIVERT" : "under pressure") + (s.since ? " (since " + hhmm(s.since) + ")" : "") +
      (s.note ? ": " + s.note : "") + ".";
  }

  /* ---------------- alerts ---------------- */
  /* The treatment centres whose hourly count is due: an hour since their last count, or since
     the event started. Each centre is counted on its own; with none set up, one count for the event. */
  function tcCentres(cad) { return cad.places.filter(function (p) { return p.kind === "tc" && p.name.trim(); }); }
  function tcDue(cad, nowMs) {
    var ev = cad.event;
    if (ev.end && nowMs > ms(ev.end)) return [];
    var centres = tcCentres(cad), groups = centres.length ? centres : [{ id: null, name: "" }];
    return groups.filter(function (g) {
      var last = "";
      cad.tc.forEach(function (t) { if (g.id === null || t.place === g.id) last = t.time; });   // oldest first
      var from = last || ev.start;
      return !!from && nowMs - ms(from) >= 3600000;
    }).map(function (g) { return g.name; });
  }
  function tcDueText(names) {
    return "Treatment centre count due" + (names.join("") ? ": " + names.join(", ") + "." :
      ": record how many patients are in the centre now.");
  }

  function alerts(cad, nowMs) {
    var out = [], s = cad.settings;
    cad.calls.forEach(function (c) {
      if (c.closed || c.duplicateOf) return;
      var waited = (nowMs - ms(c.received)) / 60000, target = c.category ? s.targets[c.category] : 0;
      if (target && !isFinite(firstOnScene(c)) && waited >= target) {
        out.push({ kind: "target", call: c.id, text: "Call " + pad3(c.id) + " (category " + c.category + ") has passed its " +
          target + " min target with no unit on scene (" + Math.floor(waited) + " min)." });
      }
      if (!c.units.length && waited >= s.unassignedMins) {
        out.push({ kind: "unassigned", call: c.id, key: "u" + c.id, loud: c.category === 1,
          text: "Call " + pad3(c.id) + " has no unit assigned (" + Math.floor(waited) + " min)." });
      }
      c.units.forEach(function (a) {
        if (!a.onscene || a.moving || a.atdest || finished(a)) return;
        // Any log entry on the call since the crew arrived counts as an update.
        var last = c.log.reduce(function (t, e) { return Math.max(t, ms(e.time)); }, ms(a.onscene));
        var quiet = (nowMs - last) / 60000;
        if (quiet >= s.onSceneMins) {
          out.push({ kind: "welfare", call: c.id, unit: a.unit, key: "w" + c.id + a.unit + last, loud: true, text: callsignOf(cad, a.unit) + " on scene at call " +
            pad3(c.id) + " with no update for " + Math.floor(quiet) + " min: welfare check." });
        }
      });
    });
    cad.units.forEach(function (u) {
      var p = openPeriod(u);
      if (p && p.kind === "break" && p.until && nowMs >= ms(p.until)) {
        out.push({ kind: "breakover", unit: u.id, key: u.id + p.start,
          text: (u.callsign || "A unit") + "’s break ended at " + hhmm(p.until) + "." });
      }
    });
    Object.keys(cad.hospitalStatus).forEach(function (h) {
      if (cad.hospitalStatus[h].status === "divert") out.push({ kind: "hospital", text: hospitalWarning(cad, h) });
    });
    cad.persons.forEach(function (p) {
      if (!p.found && !p.closed) out.push({ kind: "person", text: "Missing: " + p.desc + " (reported " + hhmm(p.time) + ")." });
    });
    var due = tcDue(cad, nowMs);
    if (due.length) out.push({ kind: "tc", text: tcDueText(due) });
    return out;
  }

  /* ---------------- statistics for the report ---------------- */
  function summary(list) {
    var v = list.filter(function (m) { return isFinite(m) && m >= 0; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var mid = Math.floor(v.length / 2);
    return { n: v.length, avg: v.reduce(function (a, b) { return a + b; }, 0) / v.length,
      median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2, max: v[v.length - 1] };
  }
  function flat(lists) { return [].concat.apply([], lists); }
  function counts(labels, values) {
    return labels.map(function (l) {
      return [l, values.filter(function (v) { return v === l; }).length];
    }).filter(function (r) { return r[1] > 0; });
  }
  function firstOnScene(c) {
    var t = c.units.map(function (a) { return ms(a.onscene); }).filter(isFinite);
    return t.length ? Math.min.apply(null, t) : NaN;
  }

  /* Calls per hour, from the first call's hour to the last's. */
  function perHour(calls) {
    var hours = {};
    calls.forEach(function (c) { var k = c.received.slice(0, 13); hours[k] = (hours[k] || 0) + 1; });
    var keys = Object.keys(hours).sort();
    if (!keys.length) return [];
    var days = {}, slots = [];
    keys.forEach(function (k) { days[k.slice(0, 10)] = true; });
    var many = Object.keys(days).length > 1;
    var label = function (k) { return (many ? k.slice(8, 10) + "/" + k.slice(5, 7) + " " : "") + k.slice(11, 13) + ":00"; };
    var first = ms(keys[0] + ":00"), last = ms(keys[keys.length - 1] + ":00");
    if ((last - first) / 3600000 > 24 * 14) return keys.map(function (k) { return [label(k), hours[k]]; });
    for (var t = first; t <= last; t += 3600000) {
      var k = local(new Date(t)).slice(0, 13);
      if (!slots.length || slots[slots.length - 1][2] !== k) slots.push([label(k), hours[k] || 0, k]);
    }
    return slots.map(function (s) { return [s[0], s[1]]; });
  }

  function stats(cad) {
    var until = now();   // anything still running counts up to now
    var calls = cad.calls.filter(function (c) { return !c.duplicateOf; });
    var patients = flat(calls.map(function (c) { return c.patients; }));
    var toHospital = patients.filter(function (p) { return TO_HOSPITAL.indexOf(p.outcome) >= 0; }).length;
    var crowd = cad.event.crowd;
    var groups = [["All calls", calls]].concat(CATEGORIES.map(function (k) {
      return ["Category " + k[0], calls.filter(function (c) { return c.category === k[0]; })];
    }), [["No category", calls.filter(function (c) { return !c.category; })]]);

    var allJobs = flat(cad.calls.map(function (c) { return c.units.map(function (a) { return { call: c, a: a }; }); }));
    var toScene = function (c) { return (firstOnScene(c) - ms(c.received)) / 60000; };
    // Calls that reached the scene, against their category's target: how many made it.
    var targets = function (list) {
      var timed = list.filter(function (c) { return c.category && cad.settings.targets[c.category] && toScene(c) >= 0; });
      return timed.length ? { n: timed.length, met: timed.filter(function (c) {
        return toScene(c) <= cad.settings.targets[c.category];
      }).length } : null;
    };
    var places = {};
    calls.forEach(function (c) { var n = placeName(cad, c.place) || "No point of interest given"; places[n] = (places[n] || 0) + 1; });
    var ev = cad.event, dutyEnd = ev.end && ev.end < until ? ev.end : until;
    var days = Object.keys(calls.reduce(function (o, c) { o[c.received.slice(0, 10)] = true; return o; }, {})).sort();
    var squares = {};
    calls.forEach(function (c) { var sq = gridSquare(cad, c.grid); if (sq) squares[sq.key] = (squares[sq.key] || 0) + 1; });
    var ageOf = function (p) { var n = parseInt(p.age, 10); return isFinite(n) ? n : -1; };
    return {
      calls: calls.length,
      duplicates: cad.calls.length - calls.length,
      patients: patients.length,
      toHospital: toHospital,
      ppr: crowd > 0 ? patients.length / crowd * 1000 : null,
      tthr: crowd > 0 ? toHospital / crowd * 1000 : null,
      response: groups.filter(function (g) { return g[1].length; }).map(function (g) {
        return { label: g[0], calls: g[1].length,
          callToScene: summary(g[1].map(toScene)), target: targets(g[1]),
          assignToScene: summary(flat(g[1].map(function (c) {
            return c.units.map(function (a) { return mins(a.assigned, a.onscene); });
          }))) };
      }),
      perHour: perHour(calls),
      byProtocol: MPDS.map(function (p) {
        return [p[0] + "  " + p[1], calls.filter(function (c) { return c.protocol === p[0]; }).length];
      }).filter(function (r) { return r[1]; }).concat(
        [["Not coded", calls.filter(function (c) { return !c.protocol; }).length]].filter(function (r) { return r[1]; })),
      byCategory: CATEGORIES.map(function (k) {
        return ["Category " + k[0] + "  (" + k[1] + ")", calls.filter(function (c) { return c.category === k[0]; }).length];
      }).concat([["No category", calls.filter(function (c) { return !c.category; }).length]])
        .filter(function (r) { return r[1]; }),
      bySource: counts(SOURCES.concat(["Not recorded"]), calls.map(function (c) { return c.source || "Not recorded"; })),
      flags: FLAGS.map(function (f) { return [f[1], calls.filter(function (c) { return c.flags[f[0]]; }).length]; }),
      presentations: counts(PRESENTATIONS.concat(["Not recorded"]), patients.map(function (p) { return p.type || "Not recorded"; })),
      alcohol: patients.filter(function (p) { return p.alcohol; }).length,
      ages: AGE_BANDS.map(function (b) {
        return [b[0], patients.filter(function (p) { return ageOf(p) >= b[1] && ageOf(p) <= b[2]; }).length];
      }).concat([["Not recorded", patients.filter(function (p) { return ageOf(p) < 0 || ageOf(p) > 150; }).length]])
        .filter(function (r) { return r[1]; }),
      byDay: days.length > 1 ? days.map(function (day) {
        var dc = calls.filter(function (c) { return c.received.slice(0, 10) === day; });
        var dp = flat(dc.map(function (c) { return c.patients; }));
        return { day: day, calls: dc.length, patients: dp.length,
          toHospital: dp.filter(function (p) { return TO_HOSPITAL.indexOf(p.outcome) >= 0; }).length,
          response: summary(dc.map(toScene)) };
      }) : [],
      squares: squares,
      // Each hourly record, with the patients seen in the hour after it and the rate per 1,000 there.
      hourly: cad.conditions.map(function (h) {
        var n = flat(calls.filter(function (c) {
          var t = ms(c.received) - ms(h.time);
          return t >= 0 && t < 3600000;
        }).map(function (c) { return c.patients; })).length;
        return { time: h.time, crowd: h.crowd, temp: h.temp, weather: h.weather, patients: n,
          rate: h.crowd ? n / h.crowd * 1000 : null };
      }),
      byLocation: Object.keys(places).map(function (n) { return [n, places[n]]; })
        .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 15),
      police: calls.filter(function (c) { return c.flags.police; }).map(function (c) {
        return { call: c.id, time: c.received, where: callPlace(cad, c), ref: c.policeRef };
      }),
      outcomes: counts(OUTCOMES.concat(["Not recorded"]), flat(calls.map(function (c) {
        return c.patients.length ? c.patients.map(function (p) { return p.outcome || "Not recorded"; })
          : [c.outcome || "Not recorded"];
      }))),
      conveyances: flat(calls.map(function (c) {
        return c.units.filter(function (a) { return a.dest === "hospital"; }).map(function (a) {
          return { call: c.id, unit: callsignOf(cad, a.unit), hospital: a.hospital, blue: a.blue, passedTo: a.passedTo,
            via: a.via === "nhs" ? "NHS ambulance control" : a.via === "hospital" ? "Direct to hospital" : "",
            nhsCad: a.nhsCad };
        });
      })),
      nhs: calls.filter(function (c) { return c.nhs.requested; }).map(function (c) {
        return { call: c.id, requested: c.nhs.requested, cad: c.nhs.cad, category: c.nhs.category,
          arrived: c.nhs.arrived, wait: mins(c.nhs.requested, c.nhs.arrived), handover: c.nhs.handover };
      }),
      units: cad.units.map(function (u) {
        var jobs = allJobs.filter(function (j) { return j.a.unit === u.id; });
        var ids = {};
        jobs.forEach(function (j) { ids[j.call.id] = true; });
        var total = function (list) {
          return list.reduce(function (n, h) { var m = mins(h.start, h.end || until); return n + (m > 0 ? m : 0); }, 0);
        };
        var breaks = u.history.filter(function (h) { return h.kind === "break"; });
        return {
          callsign: u.callsign, type: u.type, calls: Object.keys(ids).length,
          committed: jobs.reduce(function (n, j) {
            var m = mins(j.a.assigned, j.a.clear || j.a.stooddown || until);
            return n + (m > 0 ? m : 0);
          }, 0),
          turnaround: summary(jobs.filter(function (j) { return j.a.dest === "hospital"; })
            .map(function (j) { return mins(j.a.atdest, j.a.clear); })),
          breaks: breaks.length, breakMins: total(breaks),
          unavailMins: total(u.history.filter(function (h) { return h.kind === "unavailable"; })),
          offDutyMins: total(u.history.filter(function (h) { return h.kind === "offduty"; })),
          // From the event's start to its end (or now), less any time off duty.
          onDutyMins: ev.start ? Math.max(0, mins(ev.start, dutyEnd) -
            total(u.history.filter(function (h) { return h.kind === "offduty"; }))) : null
        };
      })
    };
  }

  /* ---------------- the calls as a spreadsheet ---------------- */
  function csvCell(v) {
    var s = v === undefined || v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // never read as a formula by a spreadsheet
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(cad) {
    var mins1 = function (m) { return isFinite(m) && m >= 0 ? String(Math.round(m * 10) / 10) : ""; };
    var head = ["Call", "Received", "Controller", "How it came in", "Reported by", "Point of interest", "Description",
      "what3words", "Grid ref", "MPDS protocol", "Category", "Details", "Police involved", "Police / security ref",
      "Safeguarding concern", "Lost or vulnerable person", "Duplicate of", "Patients", "Ages", "Sexes", "PRF numbers",
      "Patient outcomes", "Presentations", "Alcohol or drugs involved", "Call outcome", "Units", "First unit assigned", "First on scene", "Received to first on scene (min)",
      "Hospitals", "Blue light / pre-alert", "NHS ambulance requested", "NHS CAD no.", "NHS crew arrived", "NHS wait (min)", "Closed"];
    var rows = cad.calls.slice().sort(function (a, b) { return a.id - b.id; }).map(function (c) {
      var list = function (f) { return c.patients.map(f).join("; "); };
      var first = function (f) {
        var t = c.units.map(function (a) { return a[f]; }).filter(Boolean).sort();
        return t[0] || "";
      };
      var hospital = c.units.filter(function (a) { return a.dest === "hospital"; });
      return [pad3(c.id), ukStamp(c.received), c.controller, c.source, c.reportedBy, placeName(cad, c.place), c.locText,
        c.w3w ? "///" + c.w3w : "", c.grid, c.protocol ? c.protocol + " " + protocolName(c.protocol) : "",
        c.category || "", c.details, c.flags.police ? "Yes" : "No", c.policeRef, c.flags.safeguarding ? "Yes" : "No",
        c.flags.vulnerable ? "Yes" : "No", c.duplicateOf ? pad3(c.duplicateOf) : "", c.patients.length,
        list(function (p) { return p.age; }), list(function (p) { return p.sex; }), list(function (p) { return p.prf; }),
        list(function (p) { return p.outcome; }), list(function (p) { return p.type; }),
        list(function (p) { return p.alcohol ? "Yes" : "No"; }), c.outcome,
        c.units.map(function (a) { return callsignOf(cad, a.unit); }).join("; "),
        ukStamp(first("assigned")), ukStamp(first("onscene")), mins1((firstOnScene(c) - ms(c.received)) / 60000),
        hospital.map(function (a) { return a.hospital; }).join("; "), hospital.some(function (a) { return a.blue; }) ? "Yes" : "",
        ukStamp(c.nhs.requested), c.nhs.cad, ukStamp(c.nhs.arrived), mins1(mins(c.nhs.requested, c.nhs.arrived)),
        ukStamp(c.closed)];
    });
    return [head].concat(rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  global.CAD = {
    KEY: KEY, FORMAT: FORMAT, SETUP_FORMAT: SETUP_FORMAT,
    MPDS: MPDS, CATEGORIES: CATEGORIES, OUTCOMES: OUTCOMES, SOURCES: SOURCES, SEXES: SEXES, UNIT_TYPES: UNIT_TYPES,
    PLACE_KINDS: PLACE_KINDS, STEPS: STEPS, FLAGS: FLAGS, ATMIST: ATMIST, METHANE: METHANE, PHRASES: PHRASES,
    PRESENTATIONS: PRESENTATIONS, COMPARE: COMPARE, compareFrom: compareFrom, gridSquare: gridSquare, sitrep: sitrep,
    HOSPITAL_STATUS: HOSPITAL_STATUS, TRIAGE: TRIAGE, hospitalWarning: hospitalWarning, csv: csv,
    stamp: stamp, now: now, ms: ms, mins: mins, addMins: addMins, hhmm: hhmm, ukStamp: ukStamp, pad3: pad3, dur: dur,
    w3w: w3w, isW3w: isW3w,
    byTime: byTime, blank: blank, newCall: newCall, newAssignment: newAssignment, clean: clean, setupOf: setupOf,
    unitById: unitById, placeById: placeById, callById: callById, placeName: placeName, protocolName: protocolName,
    callsignOf: callsignOf, callPlace: callPlace, destName: destName, lastStep: lastStep, finished: finished,
    openPeriod: openPeriod, unitStatus: unitStatus, tcCentres: tcCentres, tcDue: tcDue, tcDueText: tcDueText, alerts: alerts, stats: stats, summary: summary
  };
})(window);
