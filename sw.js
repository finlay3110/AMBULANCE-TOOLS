/* Offline support. Keeps a copy of every page and file the tools need, so the
   site opens with no connection. Whenever the network answers, the fresh copy
   is used and saved, so a new version shows as soon as it is published. */
"use strict";

var CACHE = "ambulance-tools-v3";
// Everything the tools load. test/site.js checks this list against the repository.
var FILES = [
  "index.html", "home.js", "theme.js", "disclaimer.html", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "company-profile/index.html", "company-profile/app.js",
  "drug-bag-tracker/index.html", "drug-bag-tracker/matrix.html", "drug-bag-tracker/styles.css",
  "drug-bag-tracker/app.js", "drug-bag-tracker/parts.js", "drug-bag-tracker/pdf.js",
  "drug-bag-tracker/expiry.js", "drug-bag-tracker/medicines.js", "drug-bag-tracker/vendor/jspdf.umd.min.js",
  "bag-tracker/index.html", "bag-tracker/styles.css", "bag-tracker/app.js", "bag-tracker/pdf.js",
  "bag-tracker/vendor/jspdf.umd.min.js",
  "deployment-maker/index.html", "deployment-maker/styles.css", "deployment-maker/app.js",
  "deployment-maker/pdf.js",
  "vehicle-check/index.html", "vehicle-check/styles.css", "vehicle-check/app.js", "vehicle-check/pdf.js",
  "vendor/qrcode.js"
];
var WAIT_MS = 3000;   // how long a slow network gets before the saved copy is used

/* For a page never saved here, with no connection: a short note, not the browser's error page. */
function offlinePage(req) {
  if (req.mode !== "navigate") return Response.error();
  return new Response("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<meta name=\"color-scheme\" content=\"light dark\"><title>Offline</title></head>" +
    "<body style=\"font: 16px/1.5 system-ui, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 16px\">" +
    "<h1>You are offline</h1><p>This page has not been saved on this device yet. It will be the next time " +
    "it is opened with a connection.</p><p><a href=\"" + self.registration.scope + "\">Back to Ambulance Tools</a></p>" +
    "</body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE)
    .then(function (c) { return c.addAll(FILES); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  // Only this site's old caches: other sites at the same github.io address keep theirs.
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf("ambulance-tools-") === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.href.indexOf(self.registration.scope) !== 0) return;
  // A folder's address means its index.html; query strings are ignored.
  var key = url.origin + url.pathname + (url.pathname.slice(-1) === "/" ? "index.html" : "");

  var network = fetch(req, { cache: "no-cache" }).then(function (res) {
    if (res.status === 200) {
      var copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(key, copy); }));
    }
    return res;
  });
  e.waitUntil(network.catch(function () {}));   // let the fresh copy finish saving

  e.respondWith(caches.match(key).then(function (saved) {
    if (!saved) return network.catch(function () { return offlinePage(req); });
    // The fresh copy when the network answers in time; otherwise, or on an error, the saved one.
    var fresh = network.then(function (res) {
      return res.ok || res.type === "opaqueredirect" ? res : saved;
    }, function () { return saved; });
    var slow = new Promise(function (resolve) { setTimeout(function () { resolve(saved); }, WAIT_MS); });
    return Promise.race([fresh, slow]);
  }));
});
