/* PDF for the Vehicle Check: a portrait A4 check sheet with the vehicle, every
   check, the defects and a signed sign-off. Unchecked items print as empty boxes
   to tick by hand. Uses the jsPDF bundled with the Bag Tracker. */
(function (global) {
  "use strict";

  var PAGE = { ml: 12, mr: 12, mt: 12, mb: 16 };   // mm
  var INK = [22, 32, 44];
  var LINE = [130, 140, 150];
  var BAR_BG = [18, 33, 47];
  var SOFT_BG = [242, 244, 246];
  var MUTED = [95, 105, 118];
  var GRID = [208, 213, 220];
  var MARK = { ok: [11, 107, 58], defect: [180, 35, 24], na: [95, 105, 118] };
  var ROW_H = 7.5;
  // Widths total 186 mm, the content width of portrait A4.
  var COLS = [["Check", 98], ["OK", 14], ["Defect", 16], ["N/A", 14], ["Notes", 44]];

  function txt(v) { return v === undefined || v === null ? "" : String(v).trim(); }
  function pageW(doc) { return doc.internal.pageSize.getWidth(); }
  function pageH(doc) { return doc.internal.pageSize.getHeight(); }
  function contentW(doc) { return pageW(doc) - PAGE.ml - PAGE.mr; }
  function setFont(doc, size, style) { doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); }
  function colour(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }
  function wrap(doc, value, width) { return doc.splitTextToSize(txt(value), Math.max(width, 1)); }
  function linesHeight(lines, size) { return lines.length * size * 0.3528 * 1.2; }

  function ukDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(iso));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : txt(iso);
  }

  /* Company name, with the CQC registration beside it when there is one. */
  function companyLine(c) {
    var name = txt(c.companyName), cqc = txt(c.cqcNumber);
    return (c.cqcRegistered && cqc) ? name + "  ·  CQC " + cqc : name;
  }

  /* Logo fitted in a white panel so a dark logo still reads on the dark masthead. */
  function drawLogo(doc, c, x, y, boxW, boxH) {
    if (!txt(c.logo) || !(c.logoW > 0) || !(c.logoH > 0)) return 0;
    var pad = 1.5;
    var scale = Math.min((boxW - pad * 2) / c.logoW, (boxH - pad * 2) / c.logoH);
    var w = c.logoW * scale, h = c.logoH * scale;
    var panelY = y + (boxH - h - pad * 2) / 2;
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, panelY, w + pad * 2, h + pad * 2, "F");
      doc.addImage(c.logo, c.logo.indexOf("image/png") >= 0 ? "PNG" : "JPEG", x + pad, panelY + pad, w, h);
    } catch (e) {
      return 0;   // an unreadable logo must never stop the document generating
    }
    return w + pad * 2;
  }

  function masthead(doc, data, title) {
    var c = data.company || {};
    var y = PAGE.mt, right = pageW(doc) - PAGE.mr - 4;
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, contentW(doc), 20, "F");
    var logoW = drawLogo(doc, c, PAGE.ml + 3, y + 3, 26, 14);
    var x = PAGE.ml + 4 + (logoW ? logoW + 3 : 0);
    doc.setTextColor(255, 255, 255);
    setFont(doc, 15, "bold");
    doc.text(title, x, y + 8.5);
    setFont(doc, 10, "normal");
    doc.text(wrap(doc, companyLine(c), right - x - 70)[0] || "", x, y + 15);
    setFont(doc, 9, "normal");
    doc.text("DATE", right, y + 7, { align: "right" });
    if (ukDate(data.date)) {
      setFont(doc, 14, "bold");
      doc.text(ukDate(data.date), right, y + 15.5, { align: "right" });
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(right - 42, y + 8.5, 42, 9, 1, 1, "F");
    }
    colour(doc, INK);
    return y + 20;
  }

  /* Labelled strip: [label, value]. A null value leaves a blank box to write in. */
  function detailStrip(doc, details, y) {
    var h = 12, w = contentW(doc), dw = w / details.length;
    doc.setFillColor(SOFT_BG[0], SOFT_BG[1], SOFT_BG[2]);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(PAGE.ml, y, w, h, "FD");
    details.forEach(function (d, i) {
      var cx = PAGE.ml + dw * i;
      if (i > 0) doc.line(cx, y, cx, y + h);
      setFont(doc, 7, "normal");
      colour(doc, MUTED);
      doc.text(d[0].toUpperCase(), cx + 2.5, y + 4.5);
      colour(doc, INK);
      if (d[1] === null) return;
      setFont(doc, 9, "bold");
      var lines = wrap(doc, d[1], dw - 5);
      if (lines.length === 1) { doc.text(lines[0], cx + 2.5, y + 9.5); return; }
      // Two smaller lines beat silently clipping the value.
      setFont(doc, 7.5, "bold");
      doc.text(wrap(doc, d[1], dw - 5).slice(0, 2), cx + 2.5, y + 8);
    });
    return y + h;
  }

  function note(doc, y, text) {
    setFont(doc, 8.5, "normal");
    colour(doc, MUTED);
    var lines = wrap(doc, text, contentW(doc));
    doc.text(lines, PAGE.ml, y + 4);
    colour(doc, INK);
    return y + 3 + linesHeight(lines, 8.5) + 2;
  }

  /* Text centred in a cell. Two smaller lines beat cutting a long value short. */
  function cellText(doc, text, x, y, w, h, size, style) {
    setFont(doc, size, style);
    var lines = wrap(doc, text, w);
    if (lines.length > 1) {
      size -= 1.5;
      setFont(doc, size, style);
      lines = wrap(doc, text, w).slice(0, 2);
    }
    var lh = size * 0.3528 * 1.15;   // jsPDF's own line spacing for an array of lines
    doc.text(lines, x, y + h / 2 - (lines.length * lh) / 2 + lh * 0.78);
  }


  function setLine(doc, c, w) { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w); }

  function colX(i) { return COLS.slice(0, i).reduce(function (x, c) { return x + c[1]; }, PAGE.ml); }

  /* A square to tick: filled in the status colour when it is the chosen one. */
  function box(doc, cx, cy, mark) {
    var s = 4;
    setLine(doc, LINE, 0.3);
    if (mark) {
      doc.setFillColor(mark[0], mark[1], mark[2]);
      doc.rect(cx - s / 2, cy - s / 2, s, s, "FD");
      setLine(doc, [255, 255, 255], 0.5);
      doc.line(cx - 1.2, cy - 1.2, cx + 1.2, cy + 1.2);
      doc.line(cx + 1.2, cy - 1.2, cx - 1.2, cy + 1.2);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(cx - s / 2, cy - s / 2, s, s, "FD");
    }
  }

  function band(doc, y, title) {
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, contentW(doc), 7, "F");
    setFont(doc, 9.5, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), PAGE.ml + 3, y + 4.9);
    var x = PAGE.ml;
    setFont(doc, 6.5, "bold");
    COLS.forEach(function (c, i) {
      if (i > 0 && i < 4) doc.text(c[0].toUpperCase(), x + c[1] / 2, y + 4.7, { align: "center" });
      if (i === 4) doc.text(c[0].toUpperCase(), x + 2, y + 4.7);
      x += c[1];
    });
    colour(doc, INK);
    return y + 7;
  }

  function itemRow(doc, y, item) {
    var h = ROW_H, x = PAGE.ml, right = PAGE.ml + contentW(doc);
    setLine(doc, GRID, 0.2);
    doc.line(PAGE.ml, y + h, right, y + h);
    doc.line(PAGE.ml, y, PAGE.ml, y + h);
    doc.line(right, y, right, y + h);
    COLS.forEach(function (c, i) { if (i > 0) doc.line(x, y, x, y + h); x += c[1]; });
    colour(doc, INK);
    cellText(doc, txt(item.name), PAGE.ml + 2, y, COLS[0][1] - 4, h, 9, "normal");
    ["ok", "defect", "na"].forEach(function (s, i) {
      box(doc, colX(1 + i) + COLS[1 + i][1] / 2, y + h / 2, item.status === s ? MARK[s] : null);
    });
    if (txt(item.note)) {
      colour(doc, item.status === "defect" ? MARK.defect : INK);
      cellText(doc, txt(item.note), colX(4) + 2, y, COLS[4][1] - 4, h, 8, "normal");
      colour(doc, INK);
    }
    return y + h;
  }

  function build(data) {
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var bottom = pageH(doc) - PAGE.mb;
    function room(y, need) {
      if (y + need <= bottom) return y;
      doc.addPage();
      return PAGE.mt;
    }

    var y = masthead(doc, data, "VEHICLE DAILY CHECK");
    y = detailStrip(doc, [
      ["Callsign", txt(data.callsign) || null],
      ["Registration", txt(data.reg).toUpperCase() || null],
      ["Make / model", txt(data.makeModel) || null]
    ], y);
    y = detailStrip(doc, [
      ["Mileage", txt(data.mileage) || null],
      ["Fuel", txt(data.fuel) || null],
      ["Checked by", txt(data.checkedBy) || null],
      ["Time", txt(data.time) || null]
    ], y) + 3;
    y = note(doc, y, "Mark each check OK, Defect or N/A. Note every defect, what was done about it, and who it " +
      "was reported to.");

    data.sections.forEach(function (sec) {
      if (!sec.items.length) return;
      y = room(y + 3, 7 + ROW_H);
      y = band(doc, y, txt(sec.name));
      sec.items.forEach(function (item) {
        if (y + ROW_H > bottom) y = band(doc, room(y, 7 + ROW_H * 2), txt(sec.name) + " (continued)");
        y = itemRow(doc, y, item);
      });
    });

    // Defects, then the sign-off, kept together on one page.
    var defects = [];
    data.sections.forEach(function (s) {
      s.items.forEach(function (i) { if (i.status === "defect") defects.push(txt(i.name) + ": " + txt(i.note)); });
    });
    var unchecked = data.sections.some(function (s) { return s.items.some(function (i) { return !i.status; }); });
    setFont(doc, 9, "normal");
    var lines = defects.length ? [].concat.apply([], defects.map(function (d) { return wrap(doc, "\u2022  " + d, contentW(doc) - 8); }))
      : [];
    var defH = defects.length ? 9 + linesHeight(lines, 9) : (unchecked ? 26 : 13);
    y = room(y + 6, defH + 42);

    doc.setFillColor(SOFT_BG[0], SOFT_BG[1], SOFT_BG[2]);
    setLine(doc, LINE, 0.25);
    doc.rect(PAGE.ml, y, contentW(doc), defH, "FD");
    setFont(doc, 8.5, "bold");
    colour(doc, defects.length ? MARK.defect : MUTED);
    doc.text(defects.length ? "DEFECTS (" + defects.length + ")" : "DEFECTS", PAGE.ml + 3, y + 5);
    colour(doc, INK);
    setFont(doc, 9, "normal");
    if (defects.length) doc.text(lines, PAGE.ml + 4, y + 10);
    else if (!unchecked) doc.text("No defects recorded.", PAGE.ml + 4, y + 10);
    else {
      // Lines to write defects on by hand.
      setLine(doc, GRID, 0.3);
      [12, 18, 24].forEach(function (d) { doc.line(PAGE.ml + 4, y + d, PAGE.ml + contentW(doc) - 4, y + d); });
    }
    y += defH + 5;

    // Sign-off: fit for service, who defects went to, and a signature.
    var h = 32, w = contentW(doc), half = w / 2;
    setLine(doc, LINE, 0.25);
    doc.rect(PAGE.ml, y, w, h, "S");
    doc.line(PAGE.ml + half, y, PAGE.ml + half, y + h);
    setFont(doc, 8.5, "bold");
    colour(doc, MUTED);
    doc.text("FIT FOR SERVICE", PAGE.ml + 3, y + 6);
    [["yes", "YES", MARK.ok], ["no", "NO", MARK.defect]].forEach(function (f, i) {
      var bx = PAGE.ml + 6 + i * 30;
      box(doc, bx, y + 13, data.fit === f[0] ? f[2] : null);
      setFont(doc, 10, "bold");
      colour(doc, INK);
      doc.text(f[1], bx + 4, y + 14.4);
    });
    setFont(doc, 8, "normal");
    colour(doc, MUTED);
    doc.text("Defects reported to", PAGE.ml + 3, y + 23);
    setLine(doc, [160, 168, 178], 0.15);
    doc.line(PAGE.ml + 3, y + 29, PAGE.ml + half - 3, y + 29);
    if (txt(data.reportedTo)) {
      setFont(doc, 9, "bold");
      colour(doc, INK);
      doc.text(wrap(doc, data.reportedTo, half - 8)[0], PAGE.ml + 3, y + 28);
    }
    var sx = PAGE.ml + half + 3;
    setFont(doc, 8.5, "bold");
    colour(doc, MUTED);
    doc.text("CHECKED BY", sx, y + 6);
    [["Name", txt(data.checkedBy), 13], ["Signature", "", 21], ["Date", ukDate(data.date), 29]].forEach(function (r) {
      setFont(doc, 8, "normal");
      colour(doc, MUTED);
      doc.text(r[0], sx, y + r[2]);
      setLine(doc, [160, 168, 178], 0.15);
      doc.line(sx + 17, y + r[2] + 1, PAGE.ml + w - 3, y + r[2] + 1);
      if (r[1]) {
        setFont(doc, 9, "bold");
        colour(doc, INK);
        doc.text(wrap(doc, r[1], half - 24)[0], sx + 18, y + r[2]);
      }
    });
    colour(doc, INK);

    // Footers go on last, because "of N" is not known until the end.
    var total = doc.internal.getNumberOfPages(), d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var left = ["Vehicle check", txt(data.reg).toUpperCase() || txt(data.callsign), ukDate(data.date)].filter(Boolean)
      .join("  \u00b7  ");
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      setFont(doc, 8, "normal");
      doc.setTextColor(110, 118, 128);
      doc.text(left, PAGE.ml, pageH(doc) - 7);
      doc.text("Generated " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear(), pageW(doc) / 2,
        pageH(doc) - 7, { align: "center" });
      doc.text("Page " + i + " of " + total, pageW(doc) - PAGE.mr, pageH(doc) - 7, { align: "right" });
    }
    return doc;
  }

  global.VehicleCheckPDF = { build: build };
})(window);
