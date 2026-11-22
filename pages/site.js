// The language switch and the copy buttons; the page reads fine without them.
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
  if (document.querySelector(".langs")) {
    var stored = null;
    try { stored = localStorage.getItem("beelot.site.language"); } catch (error) { /* storage is blocked */ }
    var preferred = stored || (navigator.language || "en").slice(0, 2).toLowerCase();
    show(choices.indexOf(preferred) >= 0 ? preferred : "en");
    document.querySelectorAll(".langs button").forEach(function (button) {
      button.addEventListener("click", function () {
        show(button.dataset.lang);
        try { localStorage.setItem("beelot.site.language", button.dataset.lang); } catch (error) { /* storage is blocked */ }
      });
    });
  }
  if (navigator.clipboard) {
    document.querySelectorAll("button[data-copy]").forEach(function (button) {
      button.hidden = false;
      button.addEventListener("click", function () {
        navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent.trim());
      });
    });
  }
})();
