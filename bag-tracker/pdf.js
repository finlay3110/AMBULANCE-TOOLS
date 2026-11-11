/* PDF generation: bag labels, kit list, kit checklist and sign in/out log. Uses the bundled jsPDF. */
(function (global) {
  "use strict";

  var PAGE = { ml: 12, mr: 12, mt: 12, mb: 16 }; // mm; width and height come from the page itself
  var INK = [22, 32, 44];
  var LINE = [130, 140, 150];
  var HEAD_BG = [210, 214, 219];
  var BAR_BG = [18, 33, 47];
  var SOFT_BG = [242, 244, 246];
  var MUTED = [95, 105, 118];

  function txt(v) { return v === undefined || v === null ? "" : String(v).trim(); }
  function pageW(doc) { return doc.internal.pageSize.getWidth(); }
  function pageH(doc) { return doc.internal.pageSize.getHeight(); }
  function contentW(doc) { return pageW(doc) - PAGE.ml - PAGE.mr; }
  function setFont(doc, size, style) { doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); }
  function colour(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }
  function wrap(doc, value, width) { return doc.splitTextToSize(txt(value), Math.max(width, 1)); }
  function linesHeight(lines, size) { return lines.length * size * 0.3528 * 1.2; }

  /* Company name, with the CQC registration beside it when there is one. */
  function companyLine(data) {
    var name = txt(data.companyName), cqc = txt(data.cqcNumber);
    return (data.cqcRegistered && cqc) ? name + "  \u00b7  CQC " + cqc : name;
  }

  function bagLabel(data) { return txt(data.bagNumber) || txt(data.bagName); }

  /* Logo fitted in a white panel so a dark logo still reads on the dark masthead. */
  function drawLogo(doc, data, x, y, boxW, boxH) {
    if (!txt(data.logo) || !(data.logoW > 0) || !(data.logoH > 0)) return 0;
    var pad = 1.5;
    var scale = Math.min((boxW - pad * 2) / data.logoW, (boxH - pad * 2) / data.logoH);
    var w = data.logoW * scale, h = data.logoH * scale;
    var panelY = y + (boxH - h - pad * 2) / 2;
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, panelY, w + pad * 2, h + pad * 2, "F");
      doc.addImage(data.logo, data.logo.indexOf("image/png") >= 0 ? "PNG" : "JPEG", x + pad, panelY + pad, w, h);
    } catch (e) {
      return 0;   // an unreadable logo must never stop the document generating
    }
    return w + pad * 2;
  }

  /* Dark band across the top of a sheet. Returns the y below it. */
  function masthead(doc, data, title) {
    var y = PAGE.mt, w = contentW(doc), right = pageW(doc) - PAGE.mr - 4;
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(PAGE.ml, y, w, 20, "F");
    var logoW = drawLogo(doc, data, PAGE.ml + 3, y + 3, 26, 14);
    var x = PAGE.ml + 4 + (logoW ? logoW + 3 : 0);
    doc.setTextColor(255, 255, 255);
    setFont(doc, 15, "bold");
    doc.text(title, x, y + 8.5);
    setFont(doc, 10, "normal");
    doc.text(wrap(doc, companyLine(data), right - x - 60)[0] || "", x, y + 15);

    setFont(doc, 9, "normal");
    doc.text(txt(data.bagNumber) ? "BAG No." : "BAG", right, y + 7, { align: "right" });
    setFont(doc, 14, "bold");
    doc.text(wrap(doc, bagLabel(data), 56)[0] || "", right, y + 15.5, { align: "right" });
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
      var lines = wrap(doc, d[1] || "—", dw - 5);
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
      var tx = c.align === "center" ? cx + w / 2 : c.align === "right" ? cx + w - padX : cx + padX;
      doc.text(lines, tx, y + padY + size * 0.3528 * 0.95, { align: c.align || "left" });
      cx += w;
    });
    colour(doc, INK);
    return h;
  }

  /* Strings become plain cells; an object is a cell with its own style (bold, colour). */
  function cells(texts, aligns) {
    return texts.map(function (t, i) {
      return typeof t === "object" ? Object.assign({ align: (aligns || [])[i] }, t) : { text: t, align: (aligns || [])[i] };
    });
  }

  /*
   * Pouch-by-pouch table shared by the kit list and the checklist. Each pouch
   * starts with a dark bar; a pouch bar is never left alone at the foot of a
   * page, and the column header repeats on every page.
   */
  function pouchTable(doc, data, title, y, spec) {
    var bottom = function () { return pageH(doc) - PAGE.mb; };
    function head(atY) {
      return atY + drawRow(doc, atY, spec.widths, cells(spec.header, spec.aligns),
        { bold: true, fill: HEAD_BG, size: 8.5 });
    }
    function newPage() {
      doc.addPage();
      setFont(doc, 10, "bold");
      doc.text(title + " (continued) — " + bagLabel(data), PAGE.ml, PAGE.mt + 4);
      return head(PAGE.mt + 7);
    }

    y = head(y);
    data.pouches.forEach(function (p) {
      var label = p.name.toUpperCase() + "   (" + p.items.length + " item" + (p.items.length === 1 ? "" : "s") + ")";
      if (p.sealed) label += "      SEALED \u2014 SEAL No. " + (txt(p.seal) || "______________");
      var barW = [contentW(doc)];
      var sealH = p.sealed && spec.sealCheck ? 8 : 0;
      var first = p.items[0] ? drawRow(doc, 0, spec.widths, cells(spec.row(p.items[0], 0, p), spec.aligns), { measure: true }) : 0;
      if (y + 8 + sealH + first > bottom()) y = newPage();
      y += drawRow(doc, y, barW, [{ text: label }], { bold: true, fill: BAR_BG, colour: [255, 255, 255], minH: 8 });
      if (sealH) {
        y += drawRow(doc, y, barW, [{ text: spec.sealText ? spec.sealText(p) : "Seal no. found: ______________     " +
          "Intact:  Yes  /  No     New seal no.: ______________" }], { fill: SOFT_BG, minH: sealH });
      }
      p.items.forEach(function (it, i) {
        var c = cells(spec.row(it, i, p), spec.aligns);
        var h = drawRow(doc, 0, spec.widths, c, { measure: true, minH: spec.minH });
        if (y + h > bottom()) y = newPage();
        y += drawRow(doc, y, spec.widths, c, { minH: spec.minH });
      });
    });
    return y;
  }

  /* Name / signature / date lines, one column per entry in `who`. */
  function signBlock(doc, y, title, who) {
    var w = contentW(doc), h = 30, colW = w / who.length;
    if (y + h > pageH(doc) - PAGE.mb) { doc.addPage(); y = PAGE.mt; }
    doc.setFillColor(SOFT_BG[0], SOFT_BG[1], SOFT_BG[2]);
    doc.rect(PAGE.ml, y, w, 7, "F");
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(PAGE.ml, y, w, h, "S");
    doc.line(PAGE.ml, y + 7, PAGE.ml + w, y + 7);
    setFont(doc, 8.5, "bold");
    colour(doc, [60, 72, 86]);
    doc.text(title, PAGE.ml + 3, y + 4.9);

    who.forEach(function (col, i) {
      var cx = PAGE.ml + colW * i;
      if (i > 0) doc.line(cx, y + 7, cx, y + h);
      setFont(doc, 7.5, "bold");
      colour(doc, MUTED);
      doc.text(col.label, cx + 3, y + 12);
      if (col.sig) {
        // A signature made on screen, sat on its line.
        var sh = 7, sw = Math.min(colW - 26, col.sig.w * sh / col.sig.h);
        try { doc.addImage(col.sig.src, "PNG", cx + 21, y + 23 - sh + 1, sw, sh); } catch (e) { /* never stop the PDF */ }
      }
      [["Name", col.name, 17.5], ["Signature", "", 23], ["Date", col.date, 28.5]].forEach(function (r) {
        setFont(doc, 8, "normal");
        colour(doc, MUTED);
        doc.text(r[0], cx + 3, y + r[2]);
        doc.setDrawColor(160, 168, 178);
        doc.setLineWidth(0.15);
        doc.line(cx + 20, y + r[2] + 1, cx + colW - 3, y + r[2] + 1);
        if (txt(r[1])) {
          setFont(doc, 9, "bold");
          colour(doc, INK);
          doc.text(wrap(doc, r[1], colW - 26)[0], cx + 21, y + r[2]);
        }
      });
    });
    colour(doc, INK);
    return y + h;
  }

  /* Small grey instruction text; returns the y below it. */
  function note(doc, y, text) {
    setFont(doc, 8.5, "normal");
    colour(doc, MUTED);
    var lines = wrap(doc, text, contentW(doc));
    doc.text(lines, PAGE.ml, y + 4);
    colour(doc, INK);
    return y + 3 + linesHeight(lines, 8.5) + 2;
  }

  function ukDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(iso));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : txt(iso);
  }

  function itemCount(data) {
    return data.pouches.reduce(function (n, p) { return n + p.items.length; }, 0);
  }

  /* ---------------- 1. Kit list ---------------- */
  function kitList(doc, data) {
    doc.addPage();
    var y = masthead(doc, data, "BAG KIT LIST");
    y = detailStrip(doc, [
      ["Bag", txt(data.bagName)],
      ["Kept at", txt(data.location)],
      ["Pouches / items", data.pouches.length + " / " + itemCount(data)],
      ["Seal number", txt(data.sealNumber)],
      ["Contact", txt(data.companyPhone)]
    ], y) + 6;
    y = pouchTable(doc, data, "Kit list", y, {
      widths: [12, 144, 30],
      header: ["#", "Item", "Min qty"],
      aligns: ["center", "left", "center"],
      row: function (it, i) { return [String(i + 1), it.name, String(it.min)]; }
    }) + 6;
    signBlock(doc, y, "BAG PACKED", [
      { label: "PACKED BY", name: data.packedBy, date: ukDate(data.packedDate) },
      { label: "CHECKED BY" }
    ]);
  }

  /* ---------------- 2. Kit checklist ---------------- */
  /* The key a check's result is kept under: the pouch and item names. */
  function resultKey(p, it) { return p.name + " / " + it.name; }

  /* With `check`, a check done on screen fills it in; without, it is a blank sheet to fill by hand. */
  function checklist(doc, data, check) {
    var c = check || null;
    doc.addPage();
    var y = masthead(doc, data, "BAG KIT CHECKLIST");
    y = detailStrip(doc, [
      ["Bag", txt(data.bagName)],
      ["Date of check", c ? [ukDate(c.date), txt(c.time)].filter(Boolean).join(" ") || null : null],
      ["Seal no. found", c && txt(c.bagSealFound) || null],
      ["New seal no.", c && txt(c.bagNewSeal) || null]
    ], y) + 3;
    y = note(doc, y, "Count each item and write the number found. Tick when it meets the minimum; note anything " +
      "replaced, short or out of date.");
    y = pouchTable(doc, data, "Kit checklist", y, {
      widths: [80, 18, 20, 18, 50],   // the OK column fits "SHORT"
      header: ["Item", "Min qty", "Found", "OK", "Notes"],
      aligns: ["left", "center", "center", "center", "left"],
      minH: 8,
      sealCheck: true,
      sealText: c ? function (p) {
        var s = (c.seals || {})[p.name] || {};
        return "Seal no. found: " + (txt(s.found) || "______________") + "     Intact:  " +
          (s.intact === "yes" ? "Yes" : s.intact === "no" ? "NO" : "Yes  /  No") + "     New seal no.: " +
          (txt(s.newSeal) || "______________");
      } : null,
      row: function (it, i, p) {
        var r = c && (c.results || {})[resultKey(p, it)];
        if (!r || txt(r.found) === "") return [it.name, String(it.min), "", "", r ? txt(r.note) : ""];
        var short = Number(r.found) < it.min;
        return [it.name, String(it.min), txt(r.found),
          short ? { text: "SHORT", bold: true, colour: [180, 35, 24] } : { text: "OK", bold: true, colour: [11, 107, 58] },
          txt(r.note)];
      }
    }) + 6;
    if (c) checkedBy(doc, y, c);
    else signBlock(doc, y, "CHECK COMPLETED", [{ label: "CHECKED BY" }, { label: "SECOND CHECK (IF REQUIRED)" }]);
  }

  /* Everyone who did an on-screen check, with their signatures. */
  function checkedBy(doc, y, c) {
    var widths = [70, 50, 22, 44], rowH = 14;
    var crew = (c.crew || []).filter(function (m) { return txt(m.name) || m.sig; });
    if (!crew.length) crew = [{}, {}];   // nobody filled in on screen: rows to sign by hand
    if (y + 8 + rowH > pageH(doc) - PAGE.mb) { doc.addPage(); y = PAGE.mt; }
    y += drawRow(doc, y, widths, cells(["CHECKED BY \u2014 " + (ukDate(c.date) || "date: ________"),
      "Clinical grade", "Signed at", "Signature"]), { bold: true, fill: HEAD_BG, size: 8.5 });
    crew.forEach(function (m) {
      if (y + rowH > pageH(doc) - PAGE.mb) { doc.addPage(); y = PAGE.mt; }
      drawRow(doc, y, widths, [{ text: txt(m.name), bold: true }, { text: txt(m.grade) }, { text: txt(m.signedAt) },
        { text: "" }], { minH: rowH });
      if (m.sig) {
        var sh = rowH - 3, sw = Math.min(widths[3] - 4, m.sig.w * sh / m.sig.h);
        try { doc.addImage(m.sig.src, "PNG", PAGE.ml + 142 + (widths[3] - sw) / 2, y + 1.5, sw, sh); } catch (e) { /* never stop the PDF */ }
      }
      y += rowH;
    });
  }

  /* ---------------- 3. Sign in / sign out log ---------------- */
  var LOG_OUT = [["Date", 19], ["Time", 13], ["Name", 30], ["Signature", 26], ["Event / vehicle", 32], ["Seal no.", 20]];
  var LOG_IN = [["Date", 19], ["Time", 13], ["Name", 30], ["Signature", 26], ["Seal no.", 20]];
  var LOG_NOTES = ["Notes", 25];   // widths total 273 = landscape A4 content width

  function signLog(doc, data) {
    doc.addPage("a4", "landscape");
    var y = masthead(doc, data, "BAG SIGN IN / SIGN OUT LOG");
    y = note(doc, y + 2, "Sign the bag out before it leaves and back in when it returns, recording the seal number " +
      "each time. If the seal is broken or the number has changed, check the bag against the kit checklist.");

    var cols = LOG_OUT.concat(LOG_IN, [LOG_NOTES]);
    var widths = cols.map(function (c) { return c[1]; });
    var sum = function (list) { return list.reduce(function (t, c) { return t + c[1]; }, 0); };
    y += drawRow(doc, y, [sum(LOG_OUT), sum(LOG_IN), LOG_NOTES[1]], [
      { text: "SIGNED OUT", align: "center" }, { text: "SIGNED IN", align: "center" }, { text: "" }
    ], { bold: true, fill: BAR_BG, colour: [255, 255, 255] });
    y += drawRow(doc, y, widths, cells(cols.map(function (c) { return c[0]; })),
      { bold: true, fill: HEAD_BG, size: 8.5 });
    var blank = cols.map(function () { return { text: "" }; });
    while (y + 10 <= pageH(doc) - PAGE.mb) y += drawRow(doc, y, widths, blank, { minH: 10 });
  }

  /* ---------------- 0. Bag labels: four to an A4 page, to cut out ---------------- */
  function labels(doc, data) {
    doc.addPage();
    var w = contentW(doc) / 2, h = (pageH(doc) - PAGE.mt - PAGE.mb) / 2;
    for (var i = 0; i < 4; i++) label(doc, data, PAGE.ml + (i % 2) * w, PAGE.mt + Math.floor(i / 2) * h, w, h);
  }

  function label(doc, data, x, y, w, h) {
    var pad = 5, inner = w - pad * 2, cy;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.rect(x, y, w, h, "S");
    doc.setLineDashPattern([], 0);

    // Company band
    doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
    doc.rect(x + pad, y + pad, inner, 18, "F");
    var logoW = drawLogo(doc, data, x + pad + 2, y + pad + 2, 24, 14);
    var tx = x + pad + 3 + (logoW ? logoW + 2 : 0);
    doc.setTextColor(255, 255, 255);
    setFont(doc, 10, "bold");
    var cqc = data.cqcRegistered && txt(data.cqcNumber);
    // With a CQC number the name keeps one line, and the number gets its own below it.
    doc.text(wrap(doc, data.companyName, x + pad + inner - tx - 2).slice(0, cqc ? 1 : 2), tx, y + pad + 8);
    if (cqc) {
      setFont(doc, 8, "normal");
      doc.text("CQC " + cqc, tx, y + pad + 13);
    }

    // Bag number, large
    cy = y + pad + 30;
    setFont(doc, 8, "normal");
    colour(doc, MUTED);
    doc.text(txt(data.bagNumber) ? "BAG No." : "BAG", x + w / 2, cy, { align: "center" });
    colour(doc, INK);
    setFont(doc, txt(data.bagNumber) ? 30 : 16, "bold");
    doc.text(wrap(doc, bagLabel(data), inner)[0] || "", x + w / 2, cy + 13, { align: "center" });
    setFont(doc, 11, "normal");
    doc.text(wrap(doc, txt(data.bagNumber) ? data.bagName : "", inner)[0] || "", x + w / 2, cy + 21, { align: "center" });

    // Seal line
    cy += 33;
    setFont(doc, 9, "normal");
    colour(doc, MUTED);
    doc.text("Seal no.", x + pad, cy);
    doc.line(x + pad + 16, cy + 1, x + pad + inner, cy + 1);
    colour(doc, INK);
    if (txt(data.sealNumber)) { setFont(doc, 10, "bold"); doc.text(txt(data.sealNumber), x + pad + 18, cy); }

    // If found
    cy += 8;
    var lines = [];
    setFont(doc, 9, "normal");
    if (txt(data.companyPhone)) lines.push("please call " + txt(data.companyPhone));
    if (txt(data.companyAddress)) lines = lines.concat(wrap(doc, (lines.length ? "or return to " : "please return to ") +
      txt(data.companyAddress).replace(/\s*\n\s*/g, ", "), inner - 6).slice(0, 4));
    if (!lines.length) lines.push("please return to " + txt(data.companyName));
    var boxH = 10 + linesHeight(lines, 9);
    doc.setFillColor(253, 243, 221);
    doc.setDrawColor(236, 211, 150);
    doc.rect(x + pad, cy, inner, boxH, "FD");
    setFont(doc, 9, "bold");
    doc.text("IF FOUND,", x + pad + 3, cy + 5.5);
    setFont(doc, 9, "normal");
    doc.text(lines, x + pad + 3, cy + 10);

    // Medical equipment warning, pinned to the bottom of the label
    setFont(doc, 8, "normal");
    colour(doc, MUTED);
    doc.text(wrap(doc, "Medical equipment. Do not open unless authorised.", inner), x + w / 2, y + h - pad - 4,
      { align: "center" });
    colour(doc, INK);
  }

  function versionText(data) {
    var v = txt(data.version), u = ukDate(data.updated);
    if (!v && !u) return "";
    return "Kit list" + (v ? " v" + v : "") + (u ? (v ? ", updated " : " updated ") + u : "");
  }

  /* Footers go on last, because "of N" is not known until the end. `bagAt` maps a page to its bag. */
  function stampFooters(doc, bagAt) {
    var total = doc.internal.getNumberOfPages();
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var made = "Generated " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
    var data;
    for (var i = 1; i <= total; i++) {
      data = bagAt[i] || data;
      doc.setPage(i);
      var base = pageH(doc) - 7;
      setFont(doc, 8, "normal");
      doc.setTextColor(110, 118, 128);
      doc.text("Bag " + bagLabel(data) + "  ·  " + txt(data.companyName), PAGE.ml, base);
      doc.text([versionText(data), made].filter(Boolean).join("  ·  "), pageW(doc) / 2, base, { align: "center" });
      doc.text("Page " + i + " of " + total, pageW(doc) - PAGE.mr, base, { align: "right" });
    }
  }

  /* "RB-01, RB-02" -> ["RB-01", "RB-02"]; no number still makes one set. */
  function bagNumbers(data) {
    var list = txt(data.bagNumber).split(/[,;\n]+/).map(txt).filter(Boolean);
    return list.length ? list : [""];
  }

  /*
   * One full set of the chosen sheets per bag number. With several bags the seal
   * numbers belong to no single bag, so they are left blank to write in.
   */
  function build(data) {
    var print = data.print || { kitList: true, checklist: true, copies: 1, log: true, label: true };
    var numbers = bagNumbers(data);
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var bagAt = {};

    numbers.forEach(function (n) {
      var bag = Object.assign({}, data, { bagNumber: n });
      if (numbers.length > 1) {
        bag.sealNumber = "";
        bag.pouches = data.pouches.map(function (p) { return Object.assign({}, p, { seal: "" }); });
      }
      bagAt[doc.internal.getNumberOfPages()] = bag;   // first page of this bag, before the blank page is removed
      if (print.label) labels(doc, bag);
      if (print.kitList) kitList(doc, bag);
      for (var c = 0; print.checklist && c < (print.copies || 1); c++) checklist(doc, bag);
      if (print.log) signLog(doc, bag);
    });

    doc.deletePage(1);
    stampFooters(doc, bagAt);
    return doc;
  }

  /* A check done on screen, as the filled-in kit checklist. */
  function buildCheck(data) {
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4" });
    checklist(doc, data, data.check);
    doc.deletePage(1);
    stampFooters(doc, { 1: data });
    return doc;
  }

  /* Six stickers per bag number, to cut out and keep on the bag. `links` is [{ number, url }]. */
  function stickers(data, links) {
    var doc = new global.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var w = contentW(doc) / 2, h = (pageH(doc) - PAGE.mt - PAGE.mb) / 3;
    links.forEach(function (l, page) {
      if (page) doc.addPage();
      for (var i = 0; i < 6; i++) {
        var x = PAGE.ml + (i % 2) * w, y = PAGE.mt + Math.floor(i / 2) * h;
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.rect(x, y, w, h, "S");
        doc.setLineDashPattern([], 0);
        doc.setFillColor(BAR_BG[0], BAR_BG[1], BAR_BG[2]);
        doc.rect(x + 4, y + 4, w - 8, 9, "F");
        setFont(doc, 9, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("BAG CHECK", x + w / 2, y + 9.8, { align: "center" });
        colour(doc, INK);
        setFont(doc, 15, "bold");
        doc.text(wrap(doc, txt(l.number) || txt(data.bagName), w - 10)[0] || "", x + w / 2, y + 21, { align: "center" });
        setFont(doc, 10, "normal");
        doc.text(wrap(doc, txt(l.number) ? txt(data.bagName) : "", w - 10)[0] || "", x + w / 2, y + 26.5, { align: "center" });
        var size = Math.min(w - 30, h - 46);
        global.Shared.drawQr(doc, l.url, x + (w - size) / 2, y + 29, size);
        setFont(doc, 8, "normal");
        colour(doc, MUTED);
        doc.text(wrap(doc, "Scan with your phone camera to check this bag.", w - 12), x + w / 2, y + 34 + size,
          { align: "center" });
        if (txt(data.companyName)) doc.text(wrap(doc, data.companyName, w - 12)[0], x + w / 2, y + h - 4, { align: "center" });
        colour(doc, INK);
      }
    });
    return doc;
  }

  global.BagPDF = { build: build, buildCheck: buildCheck, stickers: stickers, resultKey: resultKey };
})(window);
