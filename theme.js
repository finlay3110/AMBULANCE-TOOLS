/* Colour theme shared by the tools: "auto" follows the device; "light" and
   "dark" are a choice kept in localStorage. Loaded in <head>, so a chosen theme
   applies before the page paints. A button with id="themeBtn" cycles it. */
(function () {
  "use strict";

  // The Drug Bag Tracker's key, so one choice covers every tool on the site.
  var KEY = "drug-bag-tracker/theme";
  var THEMES = ["auto", "light", "dark"];
  var theme = "auto";
  try {
    var stored = localStorage.getItem(KEY);
    if (THEMES.indexOf(stored) >= 0) theme = stored;
  } catch (e) { /* private browsing: fall back to the system preference */ }

  function apply() {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("themeBtn");
    if (btn) {
      btn.textContent = "Theme: " + theme;
      btn.setAttribute("aria-label", "Colour theme: " + theme + ". Click to change.");
    }
  }

  apply();
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    apply();
    btn.addEventListener("click", function () {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      try { localStorage.setItem(KEY, theme); } catch (e) { /* not fatal */ }
      apply();
    });
  });
})();
