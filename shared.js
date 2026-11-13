/* Shared by the tools: links that carry their own data (for QR stickers), drawing a
   QR code on a PDF, a box to sign in with a finger or the mouse, sharing a PDF,
   today's date, and the saved company profile. */
(function (global) {
  "use strict";

  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(text) {
    var s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }

  /*
   * A link to this page with `payload` after the "#", which the browser never sends
   * to the website. Compressed where the browser can, to keep a QR code small.
   */
  function link(payload) {
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var base = location.href.split("#")[0];
    if (typeof CompressionStream === "undefined") return Promise.resolve(base + "#v=j" + b64url(bytes));
    return pipe(bytes, new CompressionStream("deflate-raw")).then(function (z) { return base + "#v=z" + b64url(z); });
  }

  /* The payload from such a link's "#" part, or null if it is not one. */
  function readLink(hash) {
    var m = /^#v=([jz])([A-Za-z0-9_-]+)$/.exec(hash);
    if (!m) return Promise.resolve(null);
    var bytes;
    try { bytes = unb64url(m[2]); } catch (e) { return Promise.resolve(null); }
    var raw = m[1] === "z" && typeof DecompressionStream !== "undefined"
      ? pipe(bytes, new DecompressionStream("deflate-raw")) : Promise.resolve(m[1] === "j" ? bytes : null);
    return raw.then(function (b) { return b ? JSON.parse(new TextDecoder().decode(b)) : null; })
      .catch(function () { return null; });
  }

  /* A QR code as filled squares, `size` mm across, dark runs merged into one rectangle. Needs ../vendor/qrcode.js. */
  function drawQr(doc, text, x, y, size) {
    var qr = global.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), quiet = 4, m = size / (n + quiet * 2);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size, size, "F");
    doc.setFillColor(0, 0, 0);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        var run = 1;
        while (c + run < n && qr.isDark(r, c + run)) run++;
        doc.rect(x + (quiet + c) * m, y + (quiet + r) * m, run * m, m, "F");
        c += run - 1;
      }
    }
  }

  /* A box to sign in with a finger or the mouse. `done` gets the signature as a PNG each time a stroke ends. */
  function signaturePad(done) {
    var c = document.createElement("canvas");
    c.className = "sig-pad";
    c.width = 840;
    c.height = 240;
    c.setAttribute("aria-label", "Signature: sign here with a finger or the mouse");
    var g = c.getContext("2d"), drawing = false, last = null;
    g.lineWidth = 4;
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = "#16202c";
    function at(e) {
      var r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
    }
    c.addEventListener("pointerdown", function (e) {
      drawing = true;
      last = at(e);
      c.setPointerCapture(e.pointerId);
      g.beginPath();
      g.arc(last.x, last.y, 1, 0, Math.PI * 2);
      g.stroke();
    });
    c.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = at(e);
      g.beginPath();
      g.moveTo(last.x, last.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      last = p;
    });
    function end() {
      if (!drawing) return;
      drawing = false;
      done({ src: c.toDataURL("image/png"), w: c.width, h: c.height });
    }
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    return c;
  }

  /* True where the phone can send a PDF to other apps (WhatsApp, email…); desktop browsers mostly can't. */
  function canSharePdf() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(["%PDF"], "x.pdf", { type: "application/pdf" })] }));
    } catch (e) { return false; }
  }

  /* Opens the phone's share sheet with the PDF; downloads it instead if sharing fails. */
  function sharePdf(doc, name) {
    var file = new File([doc.output("blob")], name, { type: "application/pdf" });
    return navigator.share({ files: [file], title: name }).catch(function (e) {
      if (!e || e.name !== "AbortError") doc.save(name);   // AbortError: they closed the share sheet
    });
  }

  /* Today as "2026-11-13" and the time as "14:05", both by the device's clock (not UTC). */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  /*
   * Company details from a Company Profile, or from any tool's file that holds them
   * (under "company" or "setup"). Keeps only the known fields; null if there are none.
   */
  var COMPANY_TEXT = ["companyName", "companyPhone", "companyAddress", "cqcNumber"];
  function company(raw) {
    var src = [raw, raw && raw.company, raw && raw.setup].filter(function (c) {
      return c && typeof c === "object" && !Array.isArray(c) && typeof c.companyName === "string";
    })[0];
    if (!src) return null;
    var out = { cqcRegistered: src.cqcRegistered === true };
    COMPANY_TEXT.forEach(function (f) { out[f] = typeof src[f] === "string" ? src[f] : ""; });
    if (typeof src.logo === "string" && src.logo.indexOf("data:image/") === 0) {
      out.logo = src.logo; out.logoW = +src.logoW || 0; out.logoH = +src.logoH || 0;
    }
    return out;
  }

  /* The profile the Company Profile app keeps on this device, if it has a name. */
  function savedCompany() {
    var c;
    try { c = company(JSON.parse(localStorage.getItem("company-profile/v1"))); } catch (e) { c = null; }
    return c && c.companyName.trim() ? c : null;
  }

  global.Shared = { link: link, readLink: readLink, drawQr: drawQr, signaturePad: signaturePad,
    canSharePdf: canSharePdf, sharePdf: sharePdf, today: today, nowTime: nowTime,
    company: company, savedCompany: savedCompany };
})(window);
