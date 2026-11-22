// The offer of an account at the end of a match (US-115). The state `{ matches, dismissedAt, last }` lives on the device.
import { KEYS, readJson, writeJson, type Store } from "$lib/storage";

export const OFFER_KEY = KEYS.accountOffer;
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

const isOffer = (stored: any): stored is OfferState => Boolean(stored) && Number.isFinite(stored.matches) && (stored.dismissedAt === null || Number.isFinite(stored.dismissedAt));

// A missing, corrupt or blocked storage starts the count again.
export function loadOffer(storage: Store): OfferState {
  const stored = readJson(storage, OFFER_KEY, null, isOffer);
  return stored ? { matches: stored.matches, dismissedAt: stored.dismissedAt, last: String(stored.last ?? "") } : emptyOffer();
}

// A storage that is unavailable lets the offer come back sooner.
export function saveOffer(storage: Store, state: OfferState): void {
  writeJson(storage, OFFER_KEY, state);
}
