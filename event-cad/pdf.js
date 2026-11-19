/* PDFs for the Event CAD, portrait A4: a call log for each call, the end-of-event
   report, a METHANE message, and the paper fallback pack (blank forms to carry on
   by hand). Uses the bundled jsPDF. */
(function (global) {
  "use strict";
  var C = global.CAD;

  var PAGE = { ml: 12, mr: 12, mt: 12, mb: 16 };   // mm
  var W = 186;                                      // the content width of portrait A4
  var INK = [22, 32, 44];
  var LINE = [130, 140, 150];
  var BAR_BG = [18, 33, 47];
  var SOFT_BG = [242, 244, 246];
  var HEAD_BG = [221, 227, 233];
  var MUTED = [95, 105, 118];

  function txt(v) { return v === undefined || v === null ? "" : String(v).trim(); }
  function pageW(doc) { return doc.internal.pageSize.getWidth(); }
  function pageH(doc) { return doc.internal.pageSize.getHeight(); }
  function setFont(doc, size, style) { doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); }
  function colour(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }
  function wrap(doc, value, width) { return doc.splitTextToSize(txt(value), Math.max(width, 1)); }
  function lineH(size) { return size * 0.3528 * 1.2; }
  function newDoc(cont) {
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4" });
    doc.cadCont = cont;   // the line at the top of each page after the first
    return doc;
  }
  function ukDate(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : ""; }

  /* A time on a call: hh:mm, with the date too when it is not the day the call came in. */
  function timeOn(s, day) { return !s ? "" : s.slice(0, 10) === day ? C.hhmm(s) : s.slice(8, 10) + "/" + s.slice(5, 7) + " " + C.hhmm(s); }

  /* A new page when `need` mm will not fit. */
  function room(doc, y, need) {
    if (y + need <= pageH(doc) - PAGE.mb) return y;
    doc.addPage();
    setFont(doc, 8.5, "bold");
    colour(doc, MUTED);
    doc.text(doc.cadCont || "", PAGE.ml, PAGE.mt + 3);
    colour(doc, INK);
    return PAGE.mt + 7;
  }

  function companyLine(c) {
    var name = txt(c.companyName), cqc = txt(c.cqcNumber);
    return (c.cqcRegistered && cqc) ? name + "  ·  CQC " + cqc : name;
  }

  /* Logo fitted in a white panel so a dark logo still reads on the dark masthead. */
  function drawLogo(doc, c, x, y, boxW, boxH) {
    if (!txt(c.logo) || !(c.logoW > 0) || !(c.logoH > 0)) return 0;
    var pad = 1.5, scale = Math.min((boxW - pad * 2) / c.logoW, (boxH - pad * 2) / c.logoH);
    var w = c.logoW * scale, h = c.logoH * scale, panelY = y + (boxH - h - pad * 2) / 2;
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, panelY, w + pad * 2, h + pad * 2, "F");
      doc.addImage(c.logo, c.logo.indexOf("image/png") >= 0 ? "PNG" : "JPEG", x + pad, panelY + pad, w, h);
    } catch (e) {
      return 0;   // an unreadable logo must never stop the document
    }
    return w + pad * 2;
  }

  function masthead(doc, cad, title, rightLabel, rightValue) {
    var c = cad.company || {}, y = PAGE.mt, right = pageW(doc) - PAGE.mr - 4;
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, W, 20, "F");
    var logoW = drawLogo(doc, c, PAGE.ml + 3, y + 3, 26, 14);
    var x = PAGE.ml + 4 + (logoW ? logoW + 3 : 0);
    doc.setTextColor(255, 255, 255);
    setFont(doc, 15, "bold");
    doc.text(title, x, y + 8.5);
    setFont(doc, 9.5, "normal");
    doc.text(wrap(doc, [companyLine(c), txt(cad.event.name)].filter(Boolean).join("  ·  "), right - x - 50)[0] || "", x, y + 15);
    setFont(doc, 8, "normal");
    doc.text(rightLabel, right, y + 7, { align: "right" });
    if (rightValue) {
      setFont(doc, 12, "bold");
      doc.text(rightValue, right, y + 15, { align: "right" });
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(right - 42, y + 8.5, 42, 9, 1, 1, "F");
    }
    colour(doc, INK);
    return y + 24;
  }

  /* Labelled boxes in a row: [label, value]. A null value leaves the box empty to write in. */
  function strip(doc, y, details) {
    var h = 12, dw = W / details.length;
    y = room(doc, y, h);
    doc.setFillColor(SOFT_BG[0], SOFT_BG[1], SOFT_BG[2]);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(PAGE.ml, y, W, h, "FD");
    details.forEach(function (d, i) {
      var cx = PAGE.ml + dw * i;
      if (i > 0) doc.line(cx, y, cx, y + h);
      setFont(doc, 6.5, "normal");
      colour(doc, MUTED);
      doc.text(d[0].toUpperCase(), cx + 2, y + 4);
      colour(doc, INK);
      if (d[1] === null) return;
      var value = txt(d[1]) || "—";
      setFont(doc, 9, "bold");
      var lines = wrap(doc, value, dw - 4);
      if (lines.length === 1) { doc.text(lines[0], cx + 2, y + 9.3); return; }
      setFont(doc, 7, "bold");   // two smaller lines beat cutting the value short
      doc.text(wrap(doc, value, dw - 4).slice(0, 2), cx + 2, y + 7.6);
    });
    return y + h;
  }

  function heading(doc, y, title) {
    y = room(doc, y + 3, 16);
    setFont(doc, 10.5, "bold");
    colour(doc, INK);
    doc.text(title, PAGE.ml, y + 4);
    doc.setDrawColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.setLineWidth(0.5);
    doc.line(PAGE.ml, y + 5.5, PAGE.ml + W, y + 5.5);
    return y + 7.5;
  }

  /* A labelled box of text that runs on over pages, or ruled lines to write on. */
  function textBox(doc, y, label, value, blankLines) {
    var size = 9, lh = lineH(size);
    var lines = value === null ? [] : wrap(doc, txt(value) || "—", W - 6);
    var first = true;
    do {
      // A new page first if not even a few lines fit, then as many lines as this page holds.
      y = room(doc, y, value === null ? 7 + blankLines * 7 : 9 + Math.min(lines.length, 3) * lh);
      var avail = pageH(doc) - PAGE.mb - y - 9;
      var take = value === null ? blankLines : Math.max(1, Math.min(lines.length, Math.floor(avail / lh)));
      var h = 7 + (value === null ? blankLines * 7 : take * lh + 2);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.rect(PAGE.ml, y, W, h, "S");
      setFont(doc, 6.5, "normal");
      colour(doc, MUTED);
      doc.text(label.toUpperCase() + (first ? "" : " (CONTINUED)"), PAGE.ml + 2, y + 4);
      colour(doc, INK);
      setFont(doc, size, "normal");
      if (value === null) {
        doc.setDrawColor(200, 205, 212);
        for (var i = 1; i <= blankLines; i++) doc.line(PAGE.ml + 3, y + 6 + i * 7, PAGE.ml + W - 3, y + 6 + i * 7);
      } else {
        doc.text(lines.slice(0, take), PAGE.ml + 3, y + 8.5);
        lines = lines.slice(take);
      }
      y += h;
      first = false;
    } while (lines.length);
    return y;
  }

  /* One table row; every cell is as tall as the tallest. Returns the height. */
  function row(doc, y, widths, cells, opts) {
    opts = opts || {};
    var size = opts.size || 8.5, padX = 1.6, padY = 1.5;
    // Only a cell given as an object can be bold: a plain string has a .bold method of its own.
    var bold = function (c) { return opts.bold || (!!c && typeof c === "object" && c.bold === true); };
    var wrapped = cells.map(function (c, i) {
      setFont(doc, size, bold(c) ? "bold" : "normal");
      return wrap(doc, c && typeof c === "object" ? c.text : c, widths[i] - padX * 2);
    });
    var h = opts.minH || 6.5;
    wrapped.forEach(function (lines) { h = Math.max(h, lines.length * lineH(size) + padY * 2); });
    if (opts.measure) return h;
    var x = PAGE.ml;
    wrapped.forEach(function (lines, i) {
      if (opts.fill) { doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]); doc.rect(x, y, widths[i], h, "F"); }
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.rect(x, y, widths[i], h, "S");
      setFont(doc, size, bold(cells[i]) ? "bold" : "normal");
      doc.text(lines, x + padX, y + padY + size * 0.3528 * 0.95);
      x += widths[i];
    });
    return h;
  }

  /* A titled table across pages, its header repeated. `blank` rows to write in when there are none. */
  function table(doc, y, spec) {
    y = heading(doc, y, spec.title);
    var rows = spec.rows.length ? spec.rows : [];
    if (!rows.length && !spec.blank) {
      y = room(doc, y, 6);
      setFont(doc, 8.5, "normal");
      colour(doc, MUTED);
      doc.text(spec.empty || "None.", PAGE.ml, y + 4);
      colour(doc, INK);
      return y + 7;
    }
    if (!rows.length) rows = Array.apply(null, Array(spec.blank)).map(function () { return spec.header.map(function () { return ""; }); });
    var head = function (at) { return at + row(doc, at, spec.widths, spec.header, { bold: true, fill: HEAD_BG, size: 7.5 }); };
    y = head(room(doc, y, 14));
    rows.forEach(function (r) {
      var h = row(doc, 0, spec.widths, r, { measure: true, minH: spec.minH, size: spec.size });
      if (y + h > pageH(doc) - PAGE.mb) y = head(room(doc, pageH(doc), 0));   // a new page, then the header again
      y += row(doc, y, spec.widths, r, { minH: spec.minH, size: spec.size });
    });
    return y;
  }

  /* Page numbers and the time made, on every page. */
  function footers(doc, left) {
    var total = doc.internal.getNumberOfPages(), made = "Made " + C.ukStamp(C.now());
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      var base = pageH(doc) - 7;
      setFont(doc, 8, "normal");
      doc.setTextColor(110, 118, 128);
      doc.text(wrap(doc, left, pageW(doc) / 2 - PAGE.ml - 24)[0] || "", PAGE.ml, base);
      doc.text(made, pageW(doc) / 2, base, { align: "center" });
      doc.text("Page " + i + " of " + total, pageW(doc) - PAGE.mr, base, { align: "right" });
    }
    return doc;
  }

  /* ---------------- a call log (or a blank call sheet when there is no call) ---------------- */
  function callSheet(doc, cad, c) {
    var blank = !c, day = c ? c.received.slice(0, 10) : "";
    var v = function (value) { return blank ? null : value; };
    var y = masthead(doc, cad, blank ? "CALL SHEET" : "CALL " + C.pad3(c.id), "RECEIVED", blank ? "" : C.ukStamp(c.received));
    y = strip(doc, y, [["Call no.", v(c && C.pad3(c.id))], ["How it came in", v(c && c.source)],
      ["Reported by", v(c && c.reportedBy)], ["Controller", v(c && c.controller)]]);
    y = strip(doc, y, [["MPDS protocol", v(c && (c.protocol ? c.protocol + " " + C.protocolName(c.protocol) : "Not coded"))],
      ["Category", v(c && (c.category ? "Category " + c.category : ""))],
      ["Status", v(c && (c.closed ? "Closed " + timeOn(c.closed, day) : "Open"))],
      ["Duplicate of call", v(c && (c.duplicateOf ? C.pad3(c.duplicateOf) : "No"))]]);
    y = strip(doc, y, [["Location", v(c && C.placeName(cad, c.place))], ["Description", v(c && c.locText)],
      ["what3words", v(c && (c.w3w ? "///" + c.w3w : ""))], ["Site map grid ref", v(c && C.gridText(cad, c))]]);
    y = textBox(doc, y + 2, "Details", v(c && c.details), 3);
    y = strip(doc, y + 2, C.FLAGS.map(function (f) { return [f[1], blank ? "Yes  /  No" : c.flags[f[0]] ? "YES" : "No"]; })
      .concat([["Police / security ref.", v(c && c.policeRef)]]));

    y = table(doc, y, { title: "Patients", widths: [8, 14, 20, 28, 40, 18, 58],
      header: ["#", "Age", "Sex", "PRF number", "Presentation", "Alcohol / drugs", "Outcome"],
      rows: blank ? [] : c.patients.map(function (p, i) {
        return [String(i + 1), p.age, p.sex, p.prf, p.type, p.alcohol ? "Yes" : "No", p.outcome];
      }),
      blank: blank ? 3 : 0, minH: blank ? 9 : 6.5, empty: "No patients recorded." });

    var stepCols = C.STEPS.map(function (s) { return s[0] === "clear" ? "Clear / stood down" : s[1]; });
    y = table(doc, y, { title: "Units", widths: [30, 26, 26, 26, 26, 26, 26], header: ["Unit"].concat(stepCols),
      rows: blank ? [] : c.units.map(function (a) {
        return [{ text: C.callsignOf(cad, a.unit), bold: true }].concat(C.STEPS.map(function (s) {
          if (s[0] === "clear" && !a.clear && a.stooddown) return "Stood down " + timeOn(a.stooddown, day);
          return timeOn(a[s[0]], day);
        }));
      }), blank: blank ? 3 : 0, minH: blank ? 9 : 6.5, empty: "No units assigned." });

    var moved = blank ? [] : c.units.filter(function (a) { return a.moving || a.dest; });
    if (blank) y = room(doc, pageH(doc), 0);   // the paper form's second page starts here, so neither half is split
    if (blank || moved.length) {
      y = table(doc, y, { title: "Patient moved to", widths: [26, 44, 22, 34, 34, 26],
        header: ["Unit", "Destination", "Blue light / pre-alert", "Pre-alert passed to", "Passed via", "NHS CAD no."],
        rows: moved.map(function (a) {
          return [C.callsignOf(cad, a.unit), C.destName(cad, a).replace(" (blue light)", ""), a.blue ? "YES" : "No",
            a.passedTo, a.via === "nhs" ? "NHS ambulance control" : a.via === "hospital" ? "Direct to hospital" : "", a.nhsCad];
        }), blank: blank ? 2 : 0, minH: 9 });
      var alerts = blank ? [null] : moved.filter(function (a) { return a.blue; });
      alerts.forEach(function (a) {
        y = table(doc, y, { title: "Pre-alert (ATMIST)" + (a ? ": " + C.callsignOf(cad, a.unit) : ""), widths: [40, 146],
          header: ["", "Details"], minH: blank ? 9 : 6.5,
          rows: C.ATMIST.map(function (f) { return [{ text: f[1], bold: true }, a ? a.atmist[f[0]] : ""]; })
            .concat([[{ text: "ETA", bold: true }, a ? a.eta : ""]]) });
      });
    }

    if (blank || c.nhs.requested) {
      y = heading(doc, y, "NHS ambulance");
      y = strip(doc, y, [["Requested", v(c && timeOn(c.nhs.requested, day))], ["NHS CAD no.", v(c && c.nhs.cad)],
        ["Category given", v(c && (c.nhs.category ? "Category " + c.nhs.category : ""))],
        ["NHS crew arrived", v(c && timeOn(c.nhs.arrived, day))], ["Handed over", v(c && timeOn(c.nhs.handover, day))]]);
    }

    y = table(doc, y, { title: "Call log", widths: [24, 132, 30], header: ["Time", "Entry", "By"],
      rows: blank ? [] : c.log.map(function (e) { return [timeOn(e.time, day), e.text, e.by]; }),
      blank: blank ? 8 : 0, minH: blank ? 8 : 6.5, empty: "No updates logged." });

    if (blank || !c.patients.length) {
      y = strip(doc, y + 4, [["Call outcome (when there is no patient)", v(c && (c.outcome || (c.duplicateOf ? "Duplicate call" : "")))],
        ["Closed at", v(c && timeOn(c.closed, day))]]);
    }
    return y;
  }

  function call(cad, c) {
    var doc = newDoc("Call " + C.pad3(c.id) + " (continued)  ·  " + txt(cad.event.name));
    callSheet(doc, cad, c);
    return footers(doc, ["Call " + C.pad3(c.id), txt(cad.event.name)].filter(Boolean).join("  ·  "));
  }

  /* ---------------- METHANE (a blank form when there is no message) ---------------- */
  function methaneSheet(doc, cad, m) {
    var blank = !m;
    var y = masthead(doc, cad, "METHANE MESSAGE", "TIME", blank ? "" : C.ukStamp(m.time));
    y = strip(doc, y, [["Time", blank ? null : C.ukStamp(m.time)], ["Controller", blank ? null : m.by],
      ["Passed to", blank ? null : m.passedTo]]) + 3;
    C.METHANE.forEach(function (f) {
      var value = blank ? null : txt(m[f[0]]) || "—";
      setFont(doc, 10, "normal");
      var lines = value === null ? [] : wrap(doc, value, W - 26);
      var h = Math.max(blank ? 24 : 14, 9 + lines.length * lineH(10));
      y = room(doc, y, h);
      doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
      doc.rect(PAGE.ml, y, 16, h, "F");
      doc.setTextColor(255, 255, 255);
      setFont(doc, 18, "bold");
      doc.text(f[0] === "e2" ? "E" : f[0].toUpperCase(), PAGE.ml + 8, y + h / 2 + 2.5, { align: "center" });
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.rect(PAGE.ml + 16, y, W - 16, h, "S");
      setFont(doc, 9, "bold");
      colour(doc, INK);
      doc.text(f[1], PAGE.ml + 20, y + 5);
      setFont(doc, 7.5, "normal");
      colour(doc, MUTED);
      doc.text(f[2], PAGE.ml + W - 3, y + 5, { align: "right" });
      colour(doc, INK);
      if (blank) {
        doc.setDrawColor(200, 205, 212);
        [13, 20].forEach(function (d) { doc.line(PAGE.ml + 20, y + d, PAGE.ml + W - 4, y + d); });
      } else {
        setFont(doc, 10, "normal");
        doc.text(lines, PAGE.ml + 20, y + 10.5);
      }
      y += h + 2;
    });
    return y;
  }

  function methane(cad, m) {
    var doc = newDoc("METHANE message (continued)");
    methaneSheet(doc, cad, m);
    return footers(doc, ["METHANE message", C.ukStamp(m.time)].join("  ·  "));
  }

  /* ---------------- the end-of-event report ---------------- */
  function rate(n) { return n === null ? "No crowd size" : n.toFixed(2); }
  function trio(s) { return s ? [C.dur(s.avg), C.dur(s.median), C.dur(s.max)] : ["—", "—", "—"]; }

  /* A map's picture at x, y, w by h mm, with its grid drawn over it when the map asks for that. */
  function mapImage(doc, m, x, y, w, h) {
    try { doc.addImage(m.src, m.src.indexOf("image/png") >= 0 ? "PNG" : "JPEG", x, y, w, h); } catch (e) { return; }
    if (!m.draw || !m.cols || !m.rows) return;
    var cw = w / m.cols, ch = h / m.rows, i, j;
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.25);
    for (i = 1; i < m.cols; i++) doc.line(x + i * cw, y, x + i * cw, y + h);
    for (j = 1; j < m.rows; j++) doc.line(x, y + j * ch, x + w, y + j * ch);
    var size = Math.max(4.5, Math.min(8, Math.min(cw, ch) * 0.9)), th = size * 0.3528;   // points, and their height in mm
    setFont(doc, size, "bold");
    for (i = 0; i < m.cols; i++) for (j = 0; j < m.rows; j++) {
      var label = String.fromCharCode(65 + i) + (j + 1), tw = doc.getTextWidth(label);
      doc.setFillColor(255, 255, 255);
      doc.rect(x + i * cw + 0.5, y + j * ch + 0.5, tw + 1.2, th + 0.9, "F");
      doc.setTextColor(20, 20, 20);
      doc.text(label, x + i * cw + 1.1, y + j * ch + 0.7 + th);
    }
    colour(doc, INK);
  }

  function report(cad, maps) {
    var s = C.stats(cad), ev = cad.event;
    var doc = newDoc("Event report (continued)  ·  " + txt(ev.name));
    var dates = ukDate(ev.start) && ukDate(ev.end) && ukDate(ev.start) !== ukDate(ev.end)
      ? ukDate(ev.start) + " to " + ukDate(ev.end) : ukDate(ev.start);
    var y = masthead(doc, cad, "EVENT REPORT", "EVENT DATE", dates);
    y = strip(doc, y, [["Event", ev.name], ["Venue", ev.venue], ["Starts", C.ukStamp(ev.start)], ["Ends", C.ukStamp(ev.end)]]);
    y = strip(doc, y, [["Event lead", ev.lead], ["Control contact", ev.control],
      ["Crowd size", ev.crowd ? ev.crowd.toLocaleString("en-GB") : ""],
      ["Report", cad.finalised ? "FINAL, finalised " + C.ukStamp(cad.finalised) : "Draft, made " + C.ukStamp(C.now())]]);

    y = heading(doc, y, "Summary");
    y = strip(doc, y, [["Calls", String(s.calls)], ["Patients", String(s.patients)], ["To hospital", String(s.toHospital)],
      ["Alcohol or drugs involved", String(s.alcohol)], ["Duplicate calls", String(s.duplicates)]]);
    y = strip(doc, y, [["Patients per 1,000 attendees", rate(s.ppr)], ["Hospital transfers per 1,000 attendees", rate(s.tthr)]]);
    setFont(doc, 7.5, "normal");
    colour(doc, MUTED);
    doc.text("Duplicate calls are left out of every figure. To hospital: patients conveyed to hospital or handed to an NHS " +
      "ambulance.", PAGE.ml, y + 4);
    colour(doc, INK);
    y += 6;

    y = table(doc, y, { title: "Response times", widths: [24, 12, 21, 19, 19, 21, 19, 19, 32],
      header: ["", "Calls", "Received to first on scene: average", "median", "longest",
        "Unit assigned to on scene: average", "median", "longest", "Within target"],
      rows: s.response.map(function (r) {
        var t = r.target ? r.target.met + " of " + r.target.n + " (" + Math.round(r.target.met / r.target.n * 100) + "%)" : "\u2014";
        return [{ text: r.label, bold: true }, String(r.calls)].concat(trio(r.callToScene), trio(r.assignToScene), [t]);
      }), empty: "No calls." });
    var targets = C.CATEGORIES.filter(function (k) { return cad.settings.targets[k[0]]; }).map(function (k) {
      return "category " + k[0] + " " + cad.settings.targets[k[0]] + " min";
    });
    if (targets.length) y = note(doc, y + 1, "Targets, from the call to the first unit on scene: " + targets.join(", ") + ".");

    if (cad.compare) {
      var other = cad.compare, mine = C.compareFrom(cad).figures;
      var num = function (v, k) {
        if (v === null || v === undefined) return "\u2014";
        return k === "ppr" || k === "tthr" ? v.toFixed(2) : k === "avg" || k === "median" || k === "target" ? String(Math.round(v * 10) / 10) : String(v);
      };
      y = table(doc, y, { title: "Compared with " + (other.name || "another event") + (other.start ? " (" + ukDate(other.start) + ")" : ""),
        widths: [106, 40, 40], header: ["", txt(ev.name) || "This event", other.name || "Other event"],
        rows: [["Crowd size", ev.crowd ? ev.crowd.toLocaleString("en-GB") : "\u2014", other.crowd ? other.crowd.toLocaleString("en-GB") : "\u2014"]]
          .concat(C.COMPARE.map(function (f) { return [f[1], num(mine[f[0]], f[0]), num(other.figures[f[0]], f[0])]; })) });
    }
    if (s.byDay.length) {
      y = table(doc, y, { title: "Day by day", widths: [40, 24, 24, 30, 34, 34],
        header: ["Day", "Calls", "Patients", "To hospital", "Received to on scene: average", "longest"],
        rows: s.byDay.map(function (d) {
          return [ukDate(d.day), String(d.calls), String(d.patients), String(d.toHospital),
            d.response ? C.dur(d.response.avg) : "\u2014", d.response ? C.dur(d.response.max) : "\u2014"];
        }) });
    }
    y = table(doc, y, { title: "Calls per hour", widths: [40, 20], header: ["Hour", "Calls"],
      rows: s.perHour.map(function (r) { return [r[0], String(r[1])]; }), empty: "No calls." });
    if (s.hourly.length) {
      y = table(doc, y, { title: "Attendance and weather each hour", widths: [34, 30, 34, 34, 24, 30],
        header: ["Time", "People on site", "Patients in the hour after", "Patients per 1,000 on site", "Temperature", "Weather"],
        rows: s.hourly.map(function (h) {
          return [C.ukStamp(h.time), h.crowd ? h.crowd.toLocaleString("en-GB") : "", String(h.patients),
            h.rate === null ? "\u2014" : h.rate.toFixed(2), h.temp ? h.temp + "\u00b0C" : "", h.weather];
        }) });
    }
    var list = function (title, rows) {
      y = table(doc, y, { title: title, widths: [146, 40], header: ["", "Count"],
        rows: rows.map(function (r) { return [r[0], String(r[1])]; }), empty: "None." });
    };
    list("Calls by MPDS protocol", s.byProtocol);
    list("Calls by category", s.byCategory);
    list("How calls came in", s.bySource);
    list("Busiest locations", s.byLocation);
    list("Police, safeguarding and vulnerable people", s.flags);
    y = table(doc, y, { title: "Calls with police involved", widths: [14, 32, 90, 50],
      header: ["Call", "Received", "Location", "Police / security ref."],
      rows: s.police.map(function (r) { return [C.pad3(r.call), C.ukStamp(r.time), r.where, r.ref]; }),
      empty: "No calls with police involved." });
    list("Outcomes (per patient, or per call when there was no patient)", s.outcomes);
    list("Patient presentations", s.presentations);
    list("Patients by age", s.ages);

    y = table(doc, y, { title: "Conveyances to hospital", widths: [14, 26, 40, 22, 32, 30, 22],
      header: ["Call", "Unit", "Hospital", "Blue light / pre-alert", "Pre-alert passed to", "Passed via", "NHS CAD no."],
      rows: s.conveyances.map(function (r) {
        return [C.pad3(r.call), r.unit, r.hospital, r.blue ? "YES" : "No", r.passedTo, r.via, r.nhsCad];
      }), empty: "No conveyances to hospital." });

    var waits = C.summary(s.nhs.map(function (r) { return r.wait; }));
    y = table(doc, y, { title: "NHS ambulance requests" + (waits ? "  (average wait " + C.dur(waits.avg) + ", longest " +
      C.dur(waits.max) + ")" : ""), widths: [14, 32, 34, 24, 32, 18, 32],
      header: ["Call", "Requested", "NHS CAD no.", "Category given", "NHS crew arrived", "Wait", "Handed over"],
      rows: s.nhs.map(function (r) {
        return [C.pad3(r.call), C.ukStamp(r.requested), r.cad, r.category ? "Category " + r.category : "",
          C.ukStamp(r.arrived), r.arrived ? C.dur(r.wait) : "", C.ukStamp(r.handover)];
      }), empty: "No NHS ambulances requested." });

    y = table(doc, y, { title: "Unit workload", widths: [24, 22, 12, 20, 24, 22, 20, 20, 22], size: 8,
      header: ["Unit", "Type", "Calls", "Time on calls", "Hospital turnaround (average)", "Breaks", "Unavailable",
        "Off duty", "On duty"],
      rows: s.units.map(function (u) {
        return [{ text: u.callsign, bold: true }, u.type, String(u.calls), C.dur(u.committed),
          u.turnaround ? C.dur(u.turnaround.avg) : "—",
          u.breaks ? u.breaks + " (" + C.dur(u.breakMins) + ")" : "None", u.unavailMins ? C.dur(u.unavailMins) : "None",
          u.offDutyMins ? C.dur(u.offDutyMins) : "None", u.onDutyMins === null ? "—" : C.dur(u.onDutyMins)];
      }), empty: "No units." });
    if (s.units.length && s.units[0].onDutyMins !== null) {
      y = note(doc, y + 1, "On duty: from the event's start to its end (or the time of this report), less any time off duty.");
    }

    y = table(doc, y, { title: "Treatment centres: patients in each centre, every hour", widths: [30, 40, 20, 66, 30],
      header: ["Time", "Centre", "Patients", "Notes", "By"],
      rows: cad.tc.map(function (t) { return [C.ukStamp(t.time), C.placeName(cad, t.place), String(t.count), t.notes, t.by]; }),
      empty: "No counts recorded." });

    y = table(doc, y, { title: "Control log", widths: [30, 126, 30], header: ["Time", "Entry", "By"],
      rows: cad.log.map(function (e) { return [C.ukStamp(e.time), e.text, e.by]; }), empty: "No entries." });

    y = table(doc, y, { title: "METHANE messages", widths: [28, 26, 52, 46, 34],
      header: ["Time", "Major incident", "Exact location", "Casualties", "Passed to"],
      rows: cad.methane.map(function (m) { return [C.ukStamp(m.time), m.m, m.e, m.n, m.passedTo]; }), empty: "None." });

    var crew = [].concat.apply([], cad.units.map(function (u) {
      return u.crewLog.map(function (x) { return [x.time, u.callsign, x.off, x.on, x.by]; });
    })).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    if (crew.length) {
      y = table(doc, y, { title: "Crew changes", widths: [30, 26, 50, 50, 30], header: ["Time", "Unit", "Going off", "Coming on", "By"],
        rows: crew.map(function (r) { return [C.ukStamp(r[0])].concat(r.slice(1)); }) });
    }
    if (cad.persons.length) {
      y = table(doc, y, { title: "Lost and vulnerable persons", widths: [26, 52, 36, 36, 36],
        header: ["Reported", "Description", "Last seen", "Found", "Handed to"],
        rows: cad.persons.map(function (p) {
          return [C.ukStamp(p.time), p.desc + (p.name ? " (" + p.name + ")" : ""), p.lastSeen,
            p.found ? C.hhmm(p.found) + (p.foundAt ? ", " + p.foundAt : "") : "NOT FOUND", p.closed ? C.hhmm(p.closed) + (p.handedTo ? ", " + p.handedTo : "") : ""];
        }) });
    }

    if (cad.casualties.length) {
      y = table(doc, y, { title: "Major incident casualty counts", widths: [30, 14, 14, 14, 14, 16, 54, 30],
        header: ["Time", "P1", "P2", "P3", "Dead", "Total", "Note", "By"],
        rows: cad.casualties.map(function (c) {
          return [C.ukStamp(c.time)].concat(C.TRIAGE.map(function (t) { return String(c[t[0]]); }),
            [String(C.TRIAGE.reduce(function (n, t) { return n + c[t[0]]; }, 0)), c.note, c.by]);
        }) });
    }

    // Where the calls were: a dot on each grid square of each map, sized by the number of calls.
    (maps || []).forEach(function (m) {
      var on = s.squares[m.id] || {}, keys = Object.keys(on);
      if (!m.cols || !m.rows || !keys.length) return;
      doc.addPage();
      y = masthead(doc, cad, maps.length > 1 ? "CALLS ON " + txt(m.name).toUpperCase() : "CALLS ON THE SITE MAP", "CALLS PLACED",
        String(keys.reduce(function (n, k) { return n + on[k]; }, 0)));
      var maxH = pageH(doc) - PAGE.mb - y - 10, scale = Math.min(W / m.w, maxH / m.h);
      var mw = m.w * scale, mh = m.h * scale, mx = PAGE.ml + (W - mw) / 2;
      mapImage(doc, m, mx, y, mw, mh);
      var most = Math.max.apply(null, keys.map(function (k) { return on[k]; }));
      keys.forEach(function (k) {
        var sq = C.gridSquare(m, k), n = on[k];
        var cx = mx + (sq.col + 0.5) * mw / m.cols, cy = y + (sq.row + 0.5) * mh / m.rows;
        var r = Math.max(2.5, Math.min(mw / m.cols, mh / m.rows) * 0.42 * Math.sqrt(n / most));
        doc.setFillColor(180, 35, 24);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.circle(cx, cy, r, "FD");
        doc.setTextColor(255, 255, 255);
        setFont(doc, r > 4 ? 10 : 7.5, "bold");
        doc.text(String(n), cx, cy + (r > 4 ? 1.3 : 1), { align: "center" });
      });
      colour(doc, INK);
      note(doc, y + mh + 2, "Each dot is a grid square with calls in it; the number is how many. Calls with no grid ref, or one outside " +
        "the map's grid, are not shown. Duplicate calls are left out.");
    });

    return footers(doc, ["Event report", txt(ev.name)].filter(Boolean).join("  ·  "));
  }

  /* ---------------- the paper fallback pack ---------------- */
  function paper(cad, maps) {
    var doc = newDoc("Paper fallback pack (continued)  ·  " + txt(cad.event.name));
    var y = masthead(doc, cad, "UNIT STATUS SHEET", "DATE", ukDate(cad.event.start));
    y = note(doc, y, "Write each change of status with its time: e.g. \"En route 14:05\", \"On scene 14:12 call 7\", " +
      "\"Clear 14:40 Main stage\".");
    var units = cad.units.length ? cad.units.map(function (u) {
      return [{ text: u.callsign, bold: true }, [u.type, u.reg].filter(Boolean).join(" · ") + "\n" +
        u.staff.map(function (p) { return [p.name, p.grade].filter(Boolean).join(", "); }).filter(Boolean).join("\n"),
        "", "", "", "", ""];
    }) : [];
    table(doc, y, { title: "Units", widths: [26, 50, 22, 22, 22, 22, 22],
      header: ["Unit", "Type and staff", "Status, time", "Status, time", "Status, time", "Status, time", "Status, time"],
      rows: units, blank: 12, minH: 16, size: 8 });

    doc.addPage();
    y = masthead(doc, cad, "CALL LIST", "DATE", ukDate(cad.event.start));
    table(doc, y, { title: "Calls", widths: [14, 18, 50, 32, 12, 32, 28],
      header: ["Call", "Time", "Location", "Protocol", "Cat", "Units", "Outcome"], rows: [], blank: 26, minH: 8.5 });

    doc.addPage();
    callSheet(doc, cad, null);
    doc.addPage();
    methaneSheet(doc, cad, null);

    // Each map on its own page; an unreadable picture is left out, never stopping the pack.
    (maps || []).forEach(function (m) {
      doc.addPage();
      y = masthead(doc, cad, maps.length > 1 ? "SITE MAP: " + txt(m.name).toUpperCase() : "SITE MAP", "DATE", ukDate(cad.event.start));
      var maxH = pageH(doc) - PAGE.mb - y, scale = Math.min(W / m.w, maxH / m.h);
      mapImage(doc, m, PAGE.ml + (W - m.w * scale) / 2, y, m.w * scale, m.h * scale);
    });

    doc.addPage();
    y = masthead(doc, cad, "REFERENCE", "DATE", ukDate(cad.event.start));
    var kinds = {};
    C.PLACE_KINDS.forEach(function (k) { kinds[k[0]] = k[1]; });
    y = table(doc, y, { title: "Locations", widths: [130, 56], header: ["Location", "Kind"],
      rows: cad.places.filter(function (p) { return p.name.trim(); }).map(function (p) { return [p.name, kinds[p.kind]]; }),
      empty: "None set up." });
    y = table(doc, y, { title: "Hospitals", widths: [186], header: ["Hospital"],
      rows: cad.hospitals.filter(function (h) { return h.trim(); }).map(function (h) { return [h]; }), empty: "None set up." });
    y = table(doc, y, { title: "Categories", widths: [30, 156], header: ["Category", ""],
      rows: C.CATEGORIES.map(function (k) { return ["Category " + k[0], k[1]]; }) });
    y = table(doc, y, { title: "Outcomes", widths: [186], header: ["Outcome"], rows: C.OUTCOMES.map(function (o) { return [o]; }) });
    table(doc, y, { title: "MPDS protocols", widths: [14, 172], header: ["No.", "Protocol"], size: 8, minH: 5.5,
      rows: C.MPDS.map(function (p) { return [String(p[0]), p[1]]; }) });
    return footers(doc, ["Paper fallback pack", txt(cad.event.name)].filter(Boolean).join("  ·  "));
  }

  function note(doc, y, text) {
    setFont(doc, 8.5, "normal");
    colour(doc, MUTED);
    var lines = wrap(doc, text, W);
    doc.text(lines, PAGE.ml, y + 4);
    colour(doc, INK);
    return y + 3 + lines.length * lineH(8.5) + 2;
  }

  global.CadPDF = { call: call, report: report, methane: methane, paper: paper };
})(window);
