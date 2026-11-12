// The language switch and the copy button; the page reads fine without them.
(function () {
  var root = document.documentElement;
  var choices = ["en", "fr", "nl"];
  function show(lang) {
    root.dataset.lang = lang;
    root.lang = lang;
    document.querySelectorAll(".langs button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
    });
  }
  var preferred = (navigator.language || "en").slice(0, 2).toLowerCase();
  show(choices.indexOf(preferred) >= 0 ? preferred : "en");
  document.querySelectorAll(".langs button").forEach(function (button) {
    button.addEventListener("click", function () { show(button.dataset.lang); });
  });
  var copy = document.getElementById("copy-install");
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById("install-commands").textContent.trim());
    });
  }
})();
