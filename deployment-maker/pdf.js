/* PDF for the Deployment Maker: a landscape deployment log of every unit and
   person, with boxes for sign-in, break and stand-down times and a signature.
   Uses the jsPDF bundled with the Bag Tracker. */
(function (global) {
  "use strict";

  var PAGE = { ml: 12, mr: 12, mt: 12, mb: 16 };   // mm
  var INK = [22, 32, 44];
  var LINE = [130, 140, 150];
  var HEAD_BG = [210, 214, 219];
  var BAR_BG = [18, 33, 47];
  var SOFT_BG = [242, 244, 246];
  var MUTED = [95, 105, 118];
  var ROW_H = 9;     // tall enough to write a time or sign in
  var UNIT_H = 13;   // a unit's header: a blank box leaves about 9 mm to write in

  // Widths total 273 mm, the content width of landscape A4.
  var COLS = [["Name", 52], ["Clinical grade", 36], ["Manager", 18], ["Radio", 20],
    ["Signed in", 24], ["Break started", 26], ["Stood down", 24], ["Signature", 73]];

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

  function masthead(doc, data) {
    var c = data.company || {};
    var y = PAGE.mt, right = pageW(doc) - PAGE.mr - 4;
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, contentW(doc), 20, "F");
    var logoW = drawLogo(doc, c, PAGE.ml + 3, y + 3, 26, 14);
    var x = PAGE.ml + 4 + (logoW ? logoW + 3 : 0);
    doc.setTextColor(255, 255, 255);
    setFont(doc, 15, "bold");
    doc.text("DEPLOYMENT LOG", x, y + 8.5);
    setFont(doc, 10, "normal");
    doc.text(wrap(doc, companyLine(c), right - x - 70)[0] || "", x, y + 15);
    setFont(doc, 9, "normal");
    doc.text("DATE", right, y + 7, { align: "right" });
    setFont(doc, 14, "bold");
    doc.text(ukDate(data.eventDate) || "___ / ___ / ______", right, y + 15.5, { align: "right" });
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

  /* One table row; every cell shares the tallest cell's height. Returns that height. */
  function drawRow(doc, y, widths, cells, opts) {
    opts = opts || {};
    var padX = 1.8, padY = 1.6, size = opts.size || 9;
    var wrapped = cells.map(function (c, i) {
      setFont(doc, size, c.bold || opts.bold ? "bold" : "normal");
      return wrap(doc, c.text, widths[i] - padX * 2);
    });
    var h = opts.minH || 7;
    wrapped.forEach(function (lines) { h = Math.max(h, linesHeight(lines, size) + padY * 2); });
    if (opts.measure) return h;

    var cx = PAGE.ml;
    wrapped.forEach(function (lines, i) {
      var c = cells[i], w = widths[i], fill = c.fill || opts.fill;
      if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(cx, y, w, h, "F"); }
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.rect(cx, y, w, h, "S");
      colour(doc, c.colour || opts.colour || INK);
      setFont(doc, size, c.bold || opts.bold ? "bold" : "normal");
      var tx = c.align === "center" ? cx + w / 2 : cx + padX;
      doc.text(lines, tx, y + padY + size * 0.3528 * 0.95, { align: c.align || "left" });
      cx += w;
    });
    colour(doc, INK);
    return h;
  }

  function note(doc, y, text) {
    setFont(doc, 8.5, "normal");
    colour(doc, MUTED);
    var lines = wrap(doc, text, contentW(doc));
    doc.text(lines, PAGE.ml, y + 4);
    colour(doc, INK);
    return y + 3 + linesHeight(lines, 8.5) + 2;
  }

  /*
   * The row over each unit: its callsign in a dark cell, then a white labelled
   * box for each detail it has. A detail left blank is an empty box, big enough
   * to write in with a pen on the day.
   */
  function unitHead(doc, y, u, continued, measure) {
    var full = contentW(doc), first = COLS[0][1], details = [];
    if (u.ambulance) details.push(["Vehicle reg", txt(u.reg).toUpperCase()]);
    if (!u.roaming) details.push(["Location", txt(u.location)]);
    if (u.hasKitBag) details.push(["Kit bag", txt(u.kitBag)]);
    if (u.hasDrugBag) details.push(["Drug bag", txt(u.drugBag)]);
    var callW = details.length ? first : full, cellW = (full - first) / (details.length || 1);
    var tags = [u.ambulance ? "AMBULANCE" : "", u.roaming ? "ROAMING" : ""].filter(Boolean).join("  \u00b7  ");

    setFont(doc, 10, "bold");
    var name = wrap(doc, txt(u.callsign).toUpperCase() + (continued ? " (continued)" : ""), callW - 5).slice(0, 2);
    setFont(doc, 9, "bold");
    var values = details.map(function (d) { return wrap(doc, d[1], cellW - 4).slice(0, 2); });
    var h = Math.max(UNIT_H, name.length * 4.2 + (tags ? 7 : 4));
    values.forEach(function (v) { h = Math.max(h, 8 + v.length * 3.8); });
    if (measure) return h;

    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, callW, h, "F");
    doc.setTextColor(255, 255, 255);
    setFont(doc, 10, "bold");
    doc.text(name, PAGE.ml + 2.5, y + 5.5);
    if (tags) {
      setFont(doc, 7, "bold");
      doc.text(tags, PAGE.ml + 2.5, y + h - 2.6);
    }
    details.forEach(function (d, i) {
      var x = PAGE.ml + first + cellW * i;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cellW, h, "FD");
      setFont(doc, 6.5, "normal");
      colour(doc, MUTED);
      doc.text(d[0].toUpperCase(), x + 2, y + 3.3);
      if (values[i].length) {
        setFont(doc, 9, "bold");
        colour(doc, INK);
        doc.text(values[i], x + 2, y + 7.6);
      }
    });
    colour(doc, INK);
    return h;
  }

  function personCells(p) {
    return [p.name, p.grade, p.manager ? "Yes" : "", p.radio, "", "", "", ""].map(function (t, i) {
      return { text: txt(t), bold: i === 0, align: i === 2 ? "center" : "left" };
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
    var widths = COLS.map(function (c) { return c[1]; });
    var bottom = pageH(doc) - PAGE.mb;
    var staff = data.units.reduce(function (n, u) { return n + u.staff.length; }, 0);

    function head(y) {
      return y + drawRow(doc, y, widths, COLS.map(function (c) { return { text: c[0] }; }),
        { bold: true, fill: HEAD_BG, size: 8.5 });
    }
    function newPage() {
      doc.addPage("a4", "landscape");
      setFont(doc, 10, "bold");
      colour(doc, INK);
      doc.text(["Deployment log (continued)", eventBits(data)].filter(Boolean).join("  —  "), PAGE.ml, PAGE.mt + 4);
      return head(PAGE.mt + 7);
    }

    var y = masthead(doc, data);
    y = detailStrip(doc, [
      ["Event", txt(data.eventName) || null],
      ["Venue", txt(data.venue) || null],
      ["Deployment made by", txt(data.madeBy) || null],
      ["Units / staff", data.units.length + " / " + staff],
      ["Contact", txt((data.company || {}).companyPhone) || null]
    ], y) + 3;
    y = note(doc, y, "Record the time each person signs in, starts a break and is stood down, and have them sign. " +
      "Anything left blank is for filling in by hand.");
    y = head(y);

    data.units.forEach(function (u) {
      // A unit with nobody on it yet still gets rows to write names in.
      var rows = u.staff.length ? u.staff : [{}, {}];
      var headH = unitHead(doc, 0, u, false, true);
      var firstH = drawRow(doc, 0, widths, personCells(rows[0]), { measure: true, minH: ROW_H });
      if (y + headH + firstH > bottom) y = newPage();   // never a unit header alone at the foot of a page
      y += unitHead(doc, y, u, false);
      rows.forEach(function (p) {
        var c = personCells(p);
        var h = drawRow(doc, 0, widths, c, { measure: true, minH: ROW_H });
        if (y + h > bottom) {
          y = newPage();
          y += unitHead(doc, y, u, true);
        }
        y += drawRow(doc, y, widths, c, { minH: ROW_H });
      });
    });

    stampFooters(doc, data);
    return doc;
  }

  global.DeploymentPDF = { build: build };
})(window);
