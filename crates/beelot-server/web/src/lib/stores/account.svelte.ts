// The account (US-084): a guest or a signed-in player with a passkey, the display name (US-072), the data download and the
// deletion (US-081, US-082). WebAuthn's binary fields travel as base64url text, in the JSON of webauthn-rs.
import { apiJson, apiResponse, jsonBody } from "$lib/api/client";
import { language, t } from "$lib/i18n/i18n.svelte";
import { shouldShowTutorialBanner, tutorialSeen } from "$lib/models/prefs";
import { startFriendsPolling } from "./friends.svelte";
import { loadGoals } from "./goals.svelte";

export const account = $state({
  loaded: false,
  signedIn: false,
  name: null as string | null,
  notice: "",
  tutorialBanner: false,
  boardVisible: null as boolean | null
});

export const passkeysSupported = typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials);

export function refreshTutorialBanner(): void {
  account.tutorialBanner = shouldShowTutorialBanner({ seen: tutorialSeen(localStorage), signedIn: account.signedIn });
}

export async function loadAccount(): Promise<void> {
  let info: { signedIn: boolean; name?: string };
  try {
    info = await apiJson("/api/account");
  } catch {
    account.loaded = true;
    refreshTutorialBanner();
    loadGoals(false);
    return;
  }
  account.signedIn = info.signedIn;
  account.name = info.signedIn ? (info.name ?? null) : null;
  account.loaded = true;
  refreshTutorialBanner();
  loadGoals(info.signedIn);
  startFriendsPolling(info.signedIn);
  account.boardVisible = null;
  if (info.signedIn) {
    apiJson("/api/leaderboard/visibility").then(
      (answer) => (account.boardVisible = !answer.hidden),
      () => (account.boardVisible = null)
    );
  }
}

export async function setBoardVisible(visible: boolean): Promise<void> {
  const before = account.boardVisible;
  account.boardVisible = visible;
  try {
    await apiJson("/api/leaderboard/visibility", { method: "PUT", ...jsonBody({ hidden: !visible }) });
  } catch {
    account.boardVisible = before;
  }
}

function fromBase64url(text: string): ArrayBuffer {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

class CeremonyRefused extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function ceremonyStep(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await apiResponse(url, { method: "POST", ...options });
  if (!response.ok) throw new CeremonyRefused(response.status);
  return response;
}

// The untranslated message for a ceremony that failed. The server never says why a passkey was refused, and a cancelled
// browser dialog reads the same.
export function ceremonyFailure(error: unknown): string {
  if (error instanceof CeremonyRefused) {
    if (error.status === 429) return "Too many attempts. Please try again later.";
    if (error.status === 400 || error.status === 401) return "Sign-in did not complete. Please try again.";
    return "Something went wrong. Please try again.";
  }
  if (error instanceof DOMException) return "Sign-in did not complete. Please try again.";
  return "Something went wrong. Please try again.";
}

// Creates the account's one passkey; the server then signs the browser in. The pseudonym is in the interface's language.
export async function signUpWithPasskey(): Promise<void> {
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-up/options", { body: new URLSearchParams({ language: language() }) })).json();
  const credential = (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      user: { ...options.user, id: fromBase64url(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((known: any) => ({ ...known, id: fromBase64url(known.id) }))
    }
  })) as PublicKeyCredential;
  const response = credential.response as AuthenticatorAttestationResponse;
  await ceremonyStep(
    "/api/passkeys/sign-up",
    jsonBody({
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      response: { attestationObject: toBase64url(response.attestationObject), clientDataJSON: toBase64url(response.clientDataJSON) },
      type: credential.type,
      extensions: credential.getClientExtensionResults()
    })
  );
}

// Signs in with a passkey. The passkey says whose it is: no credential is named, and the browser shows its own dialog.
export async function signInWithPasskey(): Promise<void> {
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-in/options")).json();
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((known: any) => ({ ...known, id: fromBase64url(known.id) }))
    }
  })) as PublicKeyCredential;
  const response = credential.response as AuthenticatorAssertionResponse;
  await ceremonyStep(
    "/api/passkeys/sign-in",
    jsonBody({
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      response: {
        authenticatorData: toBase64url(response.authenticatorData),
        clientDataJSON: toBase64url(response.clientDataJSON),
        signature: toBase64url(response.signature),
        userHandle: response.userHandle ? toBase64url(response.userHandle) : undefined
      },
      type: credential.type,
      extensions: credential.getClientExtensionResults()
    })
  );
}

export async function signOut(): Promise<void> {
  try {
    await apiResponse("/api/sign-out", { method: "POST" });
  } catch {
    // The session may already be gone; return home.
  }
  location.assign("/");
}

export async function saveDisplayName(name: string): Promise<string> {
  const saved = await apiJson<{ name: string }>("/api/account/name", { method: "PUT", ...jsonBody({ name }) });
  account.name = saved.name;
  return saved.name;
}

// The name fields of the forms start with the account's name, or "Player" in the language.
export function defaultPlayerName(): string {
  return account.name ?? t("Player");
}

// Opens the sign-in panel of Settings from elsewhere (the match end's offer, US-115).
export const signInRequest = $state({ open: false, signUp: false });
