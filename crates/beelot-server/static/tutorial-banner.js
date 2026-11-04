// The "New to Belote?" banner of the home page (US-104): shown to a guest who has not yet finished or dismissed it.
const TUTORIAL_SEEN_KEY = "beelot.tutorial-seen";

function shouldShowTutorialBanner({ seen, signedIn }) {
  return !seen && !signedIn;
}

// Storage can be blocked (private mode): then the tutorial simply counts as not seen.
function tutorialSeen(storage) {
  try {
    return storage.getItem(TUTORIAL_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markTutorialSeen(storage) {
  try {
    storage.setItem(TUTORIAL_SEEN_KEY, "true");
  } catch {
    // Nothing to do: the banner may come back on the next visit.
  }
}

if (typeof module !== "undefined") module.exports = { TUTORIAL_SEEN_KEY, shouldShowTutorialBanner, tutorialSeen, markTutorialSeen };
