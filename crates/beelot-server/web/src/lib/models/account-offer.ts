// The offer of an account at the end of a match (US-115). The state `{ matches, dismissedAt, last }` lives on the device.
export const OFFER_KEY = "beelot.account-offer";
export const OFFER_COOLDOWN = 3;

export interface OfferState {
  matches: number;
  dismissedAt: number | null;
  last: string;
}

export const emptyOffer = (): OfferState => ({ matches: 0, dismissedAt: null, last: "" });

export function countMatch(state: OfferState, signature: string): OfferState {
  return state.last === signature ? state : { ...state, matches: state.matches + 1, last: signature };
}

// A guest is offered an account at the first finished match, then again after OFFER_COOLDOWN more once dismissed.
export function shouldOffer(state: OfferState, signedIn: boolean): boolean {
  if (signedIn) return false;
  return state.dismissedAt === null || state.matches - state.dismissedAt >= OFFER_COOLDOWN;
}

export const dismissOffer = (state: OfferState): OfferState => ({ ...state, dismissedAt: state.matches });

export function loadOffer(storage: Storage): OfferState {
  try {
    const stored = JSON.parse(storage.getItem(OFFER_KEY) ?? "null");
    if (stored && Number.isFinite(stored.matches) && (stored.dismissedAt === null || Number.isFinite(stored.dismissedAt))) {
      return { matches: stored.matches, dismissedAt: stored.dismissedAt, last: String(stored.last ?? "") };
    }
  } catch {
    /* missing, corrupt or blocked storage */
  }
  return emptyOffer();
}

export function saveOffer(storage: Storage, state: OfferState): void {
  try {
    storage.setItem(OFFER_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the offer may come back sooner */
  }
}
