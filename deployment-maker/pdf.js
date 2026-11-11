/* PDF for the Deployment Maker: a landscape deployment log of every unit and
   person, with boxes for sign-in, break and stand-down times and a signature.
   Uses the jsPDF bundled with the Bag Tracker. */
(function (global) {
  "use strict";

  var PAGE = { ml: 12, mr: 12, mt: 12, mb: 16 };   // mm
  var INK = [22, 32, 44];
  var LINE = [130, 140, 150];
  var BAR_BG = [18, 33, 47];
  var SOFT_BG = [242, 244, 246];
  var MUTED = [95, 105, 118];
  var GRID = [208, 213, 220];     // light lines inside a unit, so the writing stands out
  var TAG_BG = [62, 82, 102];     // AMBULANCE / ROAMING tags on the dark band
  var GREEN = [11, 107, 58];      // the tools' accent: the MANAGER badge
  var BAND_H = 8, STRIP_H = 13, COLHEAD_H = 5.5, ROW_H = 9, GAP = 5;   // mm

  // A row per person. Widths total 273 mm, the content width of landscape A4.
  var COLS = [["Name", 58], ["Clinical grade", 36], ["Radio", 18], ["Signed in", 24],
    ["Break started", 25], ["Break ended", 25], ["Stood down", 24], ["Signature", 63]];
  var TIMES = ["signedIn", "breakStart", "breakEnd", "stoodDown"];   // recorded on the day, in columns 4 to 7
  // Each unit detail always sits in the same place, lined up with the columns below: [x, width].
  var SLOTS = { location: [0, 94], reg: [94, 42], kitBag: [136, 50], drugBag: [186, 87] };
  // The radio list page, for event control. Also 273 mm.
  var RADIO_COLS = [["Callsign", 50], ["Location", 70], ["Name", 70], ["Clinical grade", 50], ["Radio", 33]];

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
    if (ukDate(data.eventDate)) {
      setFont(doc, 14, "bold");
      doc.text(ukDate(data.eventDate), right, y + 15.5, { align: "right" });
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

  /* Dark band: the callsign, with small tags for an ambulance or a roaming unit. */
  function band(doc, y, u, continued) {
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, contentW(doc), BAND_H, "F");
    var title = txt(u.callsign).toUpperCase();
    setFont(doc, 10.5, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title, PAGE.ml + 3, y + 5.6);
    var x = PAGE.ml + 3 + doc.getTextWidth(title) + 3;
    [u.ambulance && "AMBULANCE", u.roaming && "ROAMING", continued && "CONTINUED"].filter(Boolean).forEach(function (t) {
      setFont(doc, 6.5, "bold");
      var w = doc.getTextWidth(t) + 4;
      doc.setFillColor(TAG_BG[0], TAG_BG[1], TAG_BG[2]);
      doc.roundedRect(x, y + 2, w, 4, 1, 1, "F");
      doc.text(t, x + 2, y + 4.9);
      x += w + 2;
    });
    colour(doc, INK);
    return y + BAND_H;
  }

  /* Light strip under the band: the unit's details, each in its fixed place. A detail
     left blank is a white box, big enough to write in with a pen on the day. */
  function strip(doc, y, u) {
    doc.setFillColor(SOFT_BG[0], SOFT_BG[1], SOFT_BG[2]);
    doc.rect(PAGE.ml, y, contentW(doc), STRIP_H, "F");
    [["location", "Location", u.roaming ? "Roaming" : txt(u.location), true],
     ["reg", "Vehicle reg", txt(u.reg).toUpperCase(), u.ambulance],
     ["kitBag", "Kit bag", txt(u.kitBag), u.hasKitBag],
     ["drugBag", "Drug bag", txt(u.drugBag), u.hasDrugBag]].forEach(function (d) {
      if (!d[3]) return;
      var x = PAGE.ml + SLOTS[d[0]][0] + 3, w = SLOTS[d[0]][1] - 6;
      setFont(doc, 6.5, "bold");
      colour(doc, MUTED);
      doc.text(d[1].toUpperCase(), x, y + 3.6);
      if (d[2]) {
        colour(doc, INK);
        cellText(doc, d[2], x, y + 4.2, w, STRIP_H - 4.6, 10, "bold");
      } else {
        doc.setFillColor(255, 255, 255);
        setLine(doc, LINE, 0.25);
        doc.roundedRect(x, y + 4.6, w, STRIP_H - 5.8, 1, 1, "FD");
      }
    });
    colour(doc, INK);
    return y + STRIP_H;
  }

  function colHead(doc, y, cols) {
    var x = PAGE.ml;
    setFont(doc, 6.5, "bold");
    colour(doc, MUTED);
    (cols || COLS).forEach(function (c) { doc.text(c[0].toUpperCase(), x + 2, y + 3.9); x += c[1]; });
    setLine(doc, LINE, 0.3);
    doc.line(PAGE.ml, y + COLHEAD_H, PAGE.ml + contentW(doc), y + COLHEAD_H);
    colour(doc, INK);
    return y + COLHEAD_H;
  }

  /* Light grid for one row: a line under it and between its columns. */
  function gridRow(doc, y, cols, h) {
    var x = PAGE.ml, right = PAGE.ml + contentW(doc);
    setLine(doc, GRID, 0.2);
    doc.line(PAGE.ml, y + h, right, y + h);
    doc.line(PAGE.ml, y, PAGE.ml, y + h);
    doc.line(right, y, right, y + h);
    cols.forEach(function (c, i) {
      if (i > 0) doc.line(x, y, x, y + h);
      x += c[1];
    });
  }

  function colX(cols, i) {
    return cols.slice(0, i).reduce(function (x, c) { return x + c[1]; }, PAGE.ml);
  }

  /* One person: name (with a MANAGER badge), grade and radio, the times recorded on the
     day if there are any, and boxes to write in. */
  function personRow(doc, y, p) {
    gridRow(doc, y, COLS, ROW_H);

    var badgeW = 0;
    if (p.manager) {
      // At the right of the name box, clear of a name written in by hand.
      setFont(doc, 6, "bold");
      badgeW = doc.getTextWidth("MANAGER") + 3.4;
      var bx = PAGE.ml + COLS[0][1] - 2 - badgeW;
      doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.roundedRect(bx, y + ROW_H / 2 - 2, badgeW, 4, 1, 1, "F");
      doc.setTextColor(255, 255, 255);
      doc.text("MANAGER", bx + 1.7, y + ROW_H / 2 + 0.95);
      badgeW += 2;
    }
    colour(doc, INK);
    cellText(doc, txt(p.name), PAGE.ml + 2, y, COLS[0][1] - 4 - badgeW, ROW_H, 9.5, "bold");
    cellText(doc, txt(p.grade), PAGE.ml + COLS[0][1] + 2, y, COLS[1][1] - 4, ROW_H, 9, "normal");
    cellText(doc, txt(p.radio), colX(COLS, 2) + 2, y, COLS[2][1] - 4, ROW_H, 9, "normal");
    TIMES.forEach(function (t, i) {
      if (txt(p[t])) cellText(doc, txt(p[t]), colX(COLS, 3 + i) + 2, y, COLS[3 + i][1] - 4, ROW_H, 9.5, "bold");
    });
    return y + ROW_H;
  }

  /* For event control: every person, their unit, where it is, and their radio. */
  function radioPage(doc, data) {
    var bottom = pageH(doc) - PAGE.mb, h = 8;
    doc.addPage("a4", "landscape");
    var y = colHead(doc, masthead(doc, data, "RADIO LIST") + 5, RADIO_COLS);
    data.units.forEach(function (u) {
      (u.staff.length ? u.staff : [{}]).forEach(function (p, i) {
        if (y + h > bottom) {
          doc.addPage("a4", "landscape");
          setFont(doc, 9, "bold");
          colour(doc, MUTED);
          doc.text(["Radio list (continued)", eventBits(data)].filter(Boolean).join("  \u2014  "), PAGE.ml, PAGE.mt + 3);
          y = colHead(doc, PAGE.mt + 7, RADIO_COLS);
        }
        gridRow(doc, y, RADIO_COLS, h);
        if (i === 0) {
          // A firmer line where each unit starts.
          setLine(doc, LINE, 0.3);
          doc.line(PAGE.ml, y, PAGE.ml + contentW(doc), y);
          colour(doc, INK);
          cellText(doc, txt(u.callsign).toUpperCase(), colX(RADIO_COLS, 0) + 2, y, RADIO_COLS[0][1] - 4, h, 9.5, "bold");
          cellText(doc, u.roaming ? "Roaming" : txt(u.location), colX(RADIO_COLS, 1) + 2, y, RADIO_COLS[1][1] - 4, h, 9, "normal");
        }
        colour(doc, INK);
        cellText(doc, txt(p.name), colX(RADIO_COLS, 2) + 2, y, RADIO_COLS[2][1] - 4, h, 9, "normal");
        cellText(doc, txt(p.grade), colX(RADIO_COLS, 3) + 2, y, RADIO_COLS[3][1] - 4, h, 9, "normal");
        cellText(doc, txt(p.radio), colX(RADIO_COLS, 4) + 2, y, RADIO_COLS[4][1] - 4, h, 10, "bold");
        y += h;
      });
    });
  }

  function eventBits(data) {
    return [txt(data.eventName), txt(data.venue), ukDate(data.eventDate)].filter(Boolean).join("  ·  ");
  }

  /* Footers go on last, because "of N" is not known until the end. */
  function stampFooters(doc, data) {
    var total = doc.internal.getNumberOfPages();
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var made = "Generated " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
    var left = ["Deployment log", eventBits(data)].filter(Boolean).join("  ·  ");
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      var base = pageH(doc) - 7;
      setFont(doc, 8, "normal");
      doc.setTextColor(110, 118, 128);
      // Cut short rather than run into the centre text, however long the event name.
      doc.text(wrap(doc, left, pageW(doc) / 2 - PAGE.ml - 22)[0] || "", PAGE.ml, base);
      doc.text(made, pageW(doc) / 2, base, { align: "center" });
      doc.text("Page " + i + " of " + total, pageW(doc) - PAGE.mr, base, { align: "right" });
    }
  }

  function build(data) {
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    var bottom = pageH(doc) - PAGE.mb;
    var staff = data.units.reduce(function (n, u) { return n + u.staff.length; }, 0);

    function newPage() {
      doc.addPage("a4", "landscape");
      setFont(doc, 9, "bold");
      colour(doc, MUTED);
      doc.text(["Deployment log (continued)", eventBits(data)].filter(Boolean).join("  \u2014  "), PAGE.ml, PAGE.mt + 3);
      colour(doc, INK);
      return PAGE.mt + 7;
    }

    var y = masthead(doc, data, "DEPLOYMENT LOG");
    y = detailStrip(doc, [
      ["Event", txt(data.eventName) || null],
      ["Venue", txt(data.venue) || null],
      ["Deployment made by", txt(data.madeBy) || null],
      ["Units / staff", data.units.length + " / " + staff],
      ["Contact", txt((data.company || {}).companyPhone) || null]
    ], y) + 2;
    y = note(doc, y, "Record the time each person signs in, starts and ends a break and is stood down, and have " +
      "them sign. Anything left blank is for filling in by hand.");

    data.units.forEach(function (u, i) {
      // A unit with nobody on it yet still gets rows to write names in.
      var rows = u.staff.length ? u.staff : [{}, {}];
      if (i > 0) y += GAP;
      // The band, details and headings never sit alone at the foot of a page.
      if (y + BAND_H + STRIP_H + COLHEAD_H + ROW_H > bottom) y = newPage();
      y = colHead(doc, strip(doc, band(doc, y, u), u));
      rows.forEach(function (p) {
        if (y + ROW_H > bottom) y = colHead(doc, band(doc, newPage(), u, true));
        y = personRow(doc, y, p);
      });
    });

    if (data.radioList !== false) radioPage(doc, data);
    stampFooters(doc, data);
    return doc;
  }

  global.DeploymentPDF = { build: build };
})(window);
