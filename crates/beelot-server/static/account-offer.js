// The offer of an account at the end of a match (US-115). The state `{ matches, dismissedAt, last }` lives on the
// device: `matches` counts the finished matches, `dismissedAt` is the count when the player said "Not now", `last`
// the signature of the last match counted (so a re-render does not count it twice).

const OFFER_KEY = "beelot.account-offer";
const OFFER_COOLDOWN = 3;

function emptyOffer() {
  return { matches: 0, dismissedAt: null, last: "" };
}

function countMatch(state, signature) {
  return state.last === signature ? state : { ...state, matches: state.matches + 1, last: signature };
}

// A guest is offered an account at the first finished match, then again after OFFER_COOLDOWN more once dismissed.
function shouldOffer(state, signedIn) {
  if (signedIn) return false;
  return state.dismissedAt === null || state.matches - state.dismissedAt >= OFFER_COOLDOWN;
}

function dismissOffer(state) {
  return { ...state, dismissedAt: state.matches };
}

function loadOffer(storage) {
  try {
    const stored = JSON.parse(storage.getItem(OFFER_KEY));
    if (stored && Number.isFinite(stored.matches) && (stored.dismissedAt === null || Number.isFinite(stored.dismissedAt))) {
      return { matches: stored.matches, dismissedAt: stored.dismissedAt, last: String(stored.last ?? "") };
    }
  } catch (_) { /* missing, corrupt or blocked storage */ }
  return emptyOffer();
}

function saveOffer(storage, state) {
  try {
    storage.setItem(OFFER_KEY, JSON.stringify(state));
  } catch (_) { /* storage unavailable: the offer may come back sooner */ }
}

if (typeof module !== "undefined") module.exports = { OFFER_KEY, OFFER_COOLDOWN, emptyOffer, countMatch, shouldOffer, dismissOffer, loadOffer, saveOffer };
