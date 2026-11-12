// The running version in the home footer, linked to its release notes (US-131). A build outside a release (`dev`) is
// shown as text, with no link.

// What the footer shows for the server's answer: the text, and the release page when there is one.
function versionView(info) {
  const version = typeof info?.version === "string" ? info.version.trim() : "";
  if (!version) return null;
  const text = version === "dev" ? "Beelot dev" : `Beelot v${version}`;
  const href = typeof info.releaseUrl === "string" && /^https?:\/\//.test(info.releaseUrl) ? info.releaseUrl : null;
  return { text, href };
}

// Fills `target` (an element) from the answer. Nothing is shown when the server did not answer.
function showVersion(info, target, doc, notesLabel) {
  const view = versionView(info);
  if (!view) return;
  target.textContent = "";
  if (view.href) {
    const link = doc.createElement("a");
    link.className = "text-link";
    link.href = view.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = notesLabel;
    link.textContent = view.text;
    target.append(link);
  } else {
    target.textContent = view.text;
  }
  target.hidden = false;
}

if (typeof document !== "undefined") {
  const target = document.querySelector("#app-version");
  if (target) {
    fetch("/api/version")
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => showVersion(info, target, document, typeof t === "function" ? t("Release notes") : "Release notes"))
      .catch(() => {});
  }
}

if (typeof module !== "undefined") module.exports = { versionView, showVersion };
