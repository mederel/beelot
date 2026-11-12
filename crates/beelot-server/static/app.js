// Reactions, settings, statistics and the account; the entry point, loaded last.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
function reactionsEnabled() {
  try {
    return window.localStorage.getItem("beelot.reactions-enabled") !== "false";
  } catch (_) {
    return true;
  }
}

// Shows a reaction for a few seconds next to the seat it came from.
function showReaction(position, reaction) {
  const station = [...document.querySelectorAll('[id^="private-player-"], [id^="tbl-player-"]')]
    .find((item) => item.dataset.seatIndex === String(position));
  const label = reactionLabels[reaction];
  if (!station || !label) return;
  const placement = station.id.split("-").at(-1);
  const layer = document.querySelector(station.id.startsWith("tbl-") ? "#tbl-reaction-layer" : "#private-reaction-layer");
  layer.querySelector(`.reaction-${placement}`)?.remove();
  const bubble = document.createElement("p");
  bubble.className = `reaction-bubble reaction-${placement}`;
  bubble.textContent = `${label[0]} ${t(label[1])}`;
  bubble.setAttribute("aria-label", t("{0}: {1}", playerName(station.dataset.playerName), t(label[1])));
  layer.append(bubble);
  window.setTimeout(() => bubble.remove(), 4000);
}

// Shows the reactions sent since the last refresh; a table opened anew starts after the reactions already sent.
function loadReactions(tableId, reactions) {
  if (!reactionsEnabled() || !reactions) return;
  const firstLoad = reactionsSeen.tableId !== tableId;
  if (firstLoad) reactionsSeen = { tableId, sequence: 0 };
  reactions.filter((item) => item.sequence > reactionsSeen.sequence).forEach((item) => {
    if (!firstLoad) showReaction(item.position, item.reaction);
    reactionsSeen.sequence = item.sequence;
  });
}

document.querySelectorAll("#private-reaction-bar .reaction-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const session = getPrivateSession();
    const message = document.querySelector("#private-reaction-message");
    message.textContent = "";
    if (!session) return;
    try {
      const snapshot = await api.act(session.tableId, { type: "react", reaction: button.dataset.reaction });
      const sent = snapshot.reactions.filter((item) => item.position === snapshot.you).at(-1);
      if (!sent) return;
      showReaction(sent.position, sent.reaction);
      if (reactionsSeen.tableId === session.tableId) reactionsSeen.sequence = Math.max(reactionsSeen.sequence, sent.sequence);
    } catch (error) {
      message.textContent = error.message;
    }
  });
});

document.querySelector("#bot-comments").addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.bot-comments", event.target.checked);
  } catch (_) {
    // Without storage the setting lasts until the page is reloaded.
  }
  applySettings();
});

document.querySelector("#reactions-enabled").addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.reactions-enabled", event.target.checked);
  } catch (_) {
    // Without storage the setting lasts until the page is reloaded.
  }
  applySettings();
});

// Without storage the chosen level lasts until the page is reloaded.
let sessionEffects = null;
let sessionTheme = null;

function applySettings() {
  const level = resolveEffectsLevel(storedSetting("beelot.effects") ?? sessionEffects, storedSetting("beelot.reduced-motion"),
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.body.dataset.effects = level;
  setChoice("effects", level);
  const theme = resolveTheme(storedSetting("beelot.theme") ?? sessionTheme);
  document.body.dataset.theme = theme;
  setChoice("theme", theme);
  document.querySelector("#sound-enabled").checked = window.localStorage.getItem("beelot.sound-enabled") !== "false";
  document.querySelector("#reactions-enabled").checked = reactionsEnabled();
  document.querySelector("#bot-comments").checked = botCommentsEnabled();
  if (!botCommentsEnabled()) clearBotLine();
  if (!reactionsEnabled()) {
    document.querySelector("#private-reaction-bar").hidden = true;
    document.querySelector("#private-reaction-layer").replaceChildren();
  }
}

function storedSetting(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

choiceInputs("effects").forEach((input) => input.addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.effects", event.target.value);
    window.localStorage.removeItem("beelot.reduced-motion");
  } catch (_) {
    sessionEffects = event.target.value;
  }
  applySettings();
}));
choiceInputs("theme").forEach((input) => input.addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.theme", event.target.value);
  } catch (_) {
    sessionTheme = event.target.value;
  }
  applySettings();
}));
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applySettings);
setChoice("language", language);
choiceInputs("language").forEach((input) => input.addEventListener("change", (event) => setLanguage(event.target.value)));
document.querySelector("#sound-enabled").addEventListener("change", (event) => {
  window.localStorage.setItem("beelot.sound-enabled", event.target.checked);
  playSound("bid");
});
// The event stream carries the changes; a snapshot that arrived while calls were being revealed is drawn after them.
window.setInterval(() => {
  if (viewForPath(window.location.pathname) !== "private-table") return;
  const tableId = privateTableId();
  const latest = latestSnapshots.get(tableId);
  const rendered = renderedPrivateVersion.tableId === tableId ? renderedPrivateVersion.version : -1;
  if (latest && latest.version > rendered && !privateAuctionRevealing) loadPrivateTable(tableId);
}, 500);
window.setInterval(() => {
  if (!document.querySelector("#public-waiting").hidden) updatePublicCountdown();
}, 1000);

const statisticsLabels = {
  CLASSIC: "Classic Belote",
  CONTREE: "Contrée",
  RELAXED: "Relaxed",
  CHALLENGING: "Challenging",
  SOLO: "Against bots",
  PRIVATE: "Private table",
  PUBLIC: "Public table"
};

function statisticsLabel(key) {
  return t(statisticsLabels[key] ?? key);
}

function formatNumber(value) {
  return Number(value).toLocaleString(language);
}

function formatPercent(value) {
  return value == null ? "—" : `${formatNumber(value)} %`;
}

function tableRows(table, headings, rows) {
  const head = document.createElement("tr");
  head.replaceChildren(...headings.map((heading) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = t(heading);
    return cell;
  }));
  table.replaceChildren(head, ...rows.map((values) => {
    const row = document.createElement("tr");
    row.replaceChildren(...values.map((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
      return cell;
    }));
    return row;
  }));
}

function recordRows(records) {
  return records.map((record) => [statisticsLabel(record.key), formatNumber(record.played), formatNumber(record.won),
    formatNumber(record.lost), formatPercent(record.winRate)]);
}

// The signed-in player's statistics page; a guest is invited to sign in.
// One statistics panel shows at a time, chosen with the switcher (US-124).
function showStatsPanel() {
  const panel = statsPanel(choiceValue("stats-view"));
  document.querySelectorAll("[data-stats-panel]").forEach((item) => { item.hidden = item.dataset.statsPanel !== panel; });
}
choiceInputs("stats-view").forEach((input) => input.addEventListener("change", showStatsPanel));

// The leaderboard page: the top of a variant, with the viewer's own place under the choice of variant.
async function loadLeaderboard() {
  const [table, empty, error, mineElement] = ["#board-table", "#board-empty", "#board-error", "#board-mine"]
    .map((selector) => document.querySelector(selector));
  [table, empty, error, mineElement].forEach((element) => { element.hidden = true; });
  const response = await fetch(`/api/leaderboard?variant=${choiceValue("board-variant") ?? "CLASSIC"}`).catch(() => null);
  const board = response?.ok ? await response.json().catch(() => null) : null;
  if (!board) {
    error.textContent = t("Something went wrong. Please try again.");
    error.hidden = false;
    return;
  }
  const note = mineNote(board.mine, board.minMatches);
  if (note) {
    mineElement.textContent = t(note.text, ...note.values.map((value) => formatNumber(value)));
    mineElement.hidden = false;
  }
  if (board.rows.length === 0) {
    empty.hidden = false;
    return;
  }
  tableRows(table, ["#", "Player", "Rating", "Matches"], board.rows.map((row) => [
    formatNumber(row.rank), row.name, formatNumber(row.rating), formatNumber(row.matches)
  ]));
  const mineRow = isMineListed(board.rows, board.mine) ? board.rows.findIndex((row) => row.rank === board.mine.rank) : -1;
  if (mineRow >= 0) table.rows[mineRow + 1].className = "board-mine";
  table.hidden = false;
}
choiceInputs("board-variant").forEach((input) => input.addEventListener("change", loadLeaderboard));

// The setting that hides the player from the leaderboard; shown to signed-in players only.
async function loadBoardVisibility(signedIn) {
  const setting = document.querySelector("#board-visibility-setting");
  setting.hidden = !signedIn;
  if (!signedIn) return;
  try {
    document.querySelector("#board-visible").checked = !(await apiJson("/api/leaderboard/visibility")).hidden;
  } catch (_) {
    setting.hidden = true;
  }
}
document.querySelector("#board-visible").addEventListener("change", async (event) => {
  const box = event.target;
  try {
    await apiJson("/api/leaderboard/visibility", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !box.checked }) });
  } catch (_) {
    box.checked = !box.checked;
  }
});

// The rating panel: one row per variant, and the history of each as a small line. A failure leaves the panel hidden.
const svgNamespace = "http://www.w3.org/2000/svg";

async function loadRating() {
  const panel = document.querySelector("#stats-rating-panel");
  panel.hidden = true;
  const response = await fetch("/api/ratings").catch(() => null);
  const data = response?.ok ? await response.json().catch(() => null) : null;
  const rows = ratingRows(data?.ratings);
  if (rows.length === 0) return;
  tableRows(document.querySelector("#stats-rating"), ["", "Rating", "Matches"], rows.map((row) => [
    statisticsLabel(row.variant),
    row.provisional ? t("{0} ± {1} (provisional)", formatNumber(row.rating), formatNumber(row.deviation))
      : t("{0} ± {1}", formatNumber(row.rating), formatNumber(row.deviation)),
    formatNumber(row.matches)
  ]));
  document.querySelector("#stats-rating-history").replaceChildren(...rows.filter((row) => row.history.length > 1).map((row) => {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 200 40");
    svg.setAttribute("class", "rating-line");
    svg.setAttribute("role", "img");
    const first = row.history[0].rating;
    svg.setAttribute("aria-label", t("Rating history, {0}: from {1} to {2}",
      statisticsLabel(row.variant), formatNumber(first),
      formatNumber(row.history[row.history.length - 1].rating)));
    const line = document.createElementNS(svgNamespace, "polyline");
    line.setAttribute("points", sparklinePoints(row.history, 200, 40));
    svg.append(line);
    return svg;
  }));
  panel.hidden = false;
}

async function loadStatistics() {
  const goal = document.querySelector("#stats-goal");
  goal.textContent = goals ? goalText(goals) : "";
  goal.hidden = !goals;
  const guest = document.querySelector("#stats-guest");
  const empty = document.querySelector("#stats-empty");
  const error = document.querySelector("#stats-error");
  const content = document.querySelector("#stats-content");
  [guest, empty, error, content].forEach((element) => { element.hidden = true; });
  const response = await fetch("/api/statistics").catch(() => null);
  if (response?.status === 401) {
    guest.hidden = false;
    return;
  }
  const stats = response?.ok ? await response.json().catch(() => null) : null;
  if (!stats) {
    error.textContent = t("Something went wrong. Please try again.");
    error.hidden = false;
    return;
  }
  if (stats.overall.played === 0) {
    empty.hidden = false;
    return;
  }
  const tiles = [["Matches played", formatNumber(stats.overall.played)], ["Wins", formatNumber(stats.overall.won)],
    ["Losses", formatNumber(stats.overall.lost)], ["Win rate", formatPercent(stats.overall.winRate)]];
  document.querySelector("#stats-overall").replaceChildren(...tiles.map(([label, value]) => {
    const tile = document.createElement("p");
    tile.className = "stats-tile";
    const number = document.createElement("strong");
    number.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = t(label);
    tile.append(number, caption);
    return tile;
  }));
  showStatsPanel();
  const recordHeadings = ["", "Played", "Wins", "Losses", "Win rate"];
  tableRows(document.querySelector("#stats-variants"), recordHeadings, recordRows(stats.byVariant));
  tableRows(document.querySelector("#stats-difficulties"), recordHeadings, recordRows(stats.byDifficulty));

  loadRating();
  const contracts = stats.contracts;
  const facts = [
    ["Contracts taken by your team", formatNumber(contracts.taken)],
    ["Contracts made", contracts.taken === 0 ? "—"
      : t("{0} ({1})", formatNumber(contracts.made), formatPercent(Math.round(100 * contracts.made / contracts.taken)))],
    ["Coinches by your team", t("{0}, {1} defeated the contract", formatNumber(contracts.coinchesByTeam),
      formatNumber(contracts.coinchesByTeamWon))],
    ["Coinches against your team", t("{0}, {1} defeated your contract", formatNumber(contracts.coinchesAgainstTeam),
      formatNumber(contracts.coinchesAgainstTeamWon))],
    ["Capots", formatNumber(contracts.capots)],
    ["Belotes", formatNumber(contracts.belotes)],
    ["Average points per round", stats.averagePointsPerRound == null ? "—" : formatNumber(stats.averagePointsPerRound)]
  ];
  document.querySelector("#stats-contracts").replaceChildren(...facts.flatMap(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = t(label);
    const description = document.createElement("dd");
    description.textContent = value;
    return [term, description];
  }));

  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  tableRows(document.querySelector("#stats-recent"),
    ["Date", "Mode", "Variant", "Target", "Partner", "Opponents", "Score", "Result"],
    stats.recentMatches.map((match) => {
      const result = document.createElement("span");
      result.className = match.won ? "stats-won" : "stats-lost";
      result.textContent = t(match.won ? "Won" : "Lost");
      const mode = match.mode === "SOLO" && match.difficulty
        ? t("{0} ({1})", statisticsLabel(match.mode), statisticsLabel(match.difficulty)) : statisticsLabel(match.mode);
      return [dateFormat.format(new Date(match.endedAt)), mode, statisticsLabel(match.variant),
        formatNumber(match.target), playerName(match.partner), match.opponents.map(playerName).join(", "),
        `${formatNumber(match.teamScore)} – ${formatNumber(match.opponentScore)}`, result];
    }));
  content.hidden = false;
}

// The "New to Belote?" banner (US-104) is for guests who have not finished or dismissed the tutorial.
let visitorSignedIn = false;
function updateTutorialBanner(signedIn = visitorSignedIn) {
  visitorSignedIn = signedIn;
  document.querySelector("#tutorial-banner").hidden = !shouldShowTutorialBanner({ seen: tutorialSeen(window.localStorage), signedIn });
}
document.querySelector("#tutorial-banner-dismiss").addEventListener("click", () => {
  markTutorialSeen(window.localStorage);
  updateTutorialBanner();
});

// Shows "Sign in" to a guest, or the signed-in player's pseudonym, on the home screen.
// The name shown for the account; the form and the name fields of the tables follow it (US-072).
let accountName = null;

function showAccountName(name) {
  const previous = accountName;
  accountName = name;
  document.querySelector("#account-name").textContent = t("Signed in as {0}", name);
  document.querySelector("#display-name").value = name;
  document.querySelector("#name-form").hidden = false;
  document.querySelectorAll("#setup-owner, #join-name, #public-name").forEach((input) => {
    if (input.value === t("Player") || (previous !== null && input.value === previous)) input.value = name;
  });
}

document.querySelector("#name-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#name-status");
  const checked = checkDisplayName(document.querySelector("#display-name").value);
  if (!checked.ok) {
    status.textContent = t(checked.message);
    return;
  }
  try {
    const saved = await apiJson("/api/account/name", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: checked.name }) });
    showAccountName(saved.name);
    status.textContent = t("Name saved.");
  } catch (error) {
    status.textContent = error.message;
  }
});

async function loadAccount() {
  let account;
  try {
    account = await apiJson("/api/account");
  } catch (_) {
    updateTutorialBanner(false);
    loadGoals(false);
    return;
  }
  updateTutorialBanner(account.signedIn);
  loadGoals(account.signedIn);
  startFriendsPolling(account.signedIn);
  document.querySelector("#account-guest").hidden = account.signedIn;
  document.querySelector("#account-signed-in").hidden = !account.signedIn;
  document.querySelector("#account-bar").hidden = false;
  document.querySelector("#your-data").hidden = !account.signedIn;
  loadBoardVisibility(account.signedIn);
  if (!account.signedIn) return;
  showAccountName(account.name);
}

// One sign-in panel serves the home screen and the statistics page: it moves to where it is opened.
const signInPanel = document.querySelector("#sign-in-panel");
const signInToggle = document.querySelector("#sign-in-toggle");
const passkeySignIn = document.querySelector("#passkey-sign-in");
const passkeySignUp = document.querySelector("#passkey-sign-up");
const passkeyConfirm = document.querySelector("#passkey-confirm");
const passkeyWarning = document.querySelector("#passkey-warning");
const passkeysSupported = Boolean(window.PublicKeyCredential && navigator.credentials);

function showSignUpWarning(shown) {
  passkeyWarning.hidden = !shown;
  passkeySignUp.setAttribute("aria-expanded", String(shown));
}

function openSignInPanel(container) {
  container.append(signInPanel);
  signInPanel.hidden = false;
  signInToggle.setAttribute("aria-expanded", String(container.id === "account-bar"));
  document.querySelector("#sign-in-status").textContent = "";
  showSignUpWarning(false);
  document.querySelector("#passkey-actions").hidden = !passkeysSupported;
  document.querySelector("#passkey-unsupported").hidden = passkeysSupported;
  if (passkeysSupported) passkeySignIn.focus();
}

signInToggle.addEventListener("click", () => {
  if (!signInPanel.hidden && signInPanel.parentElement.id === "account-bar") {
    signInPanel.hidden = true;
    signInToggle.setAttribute("aria-expanded", "false");
    return;
  }
  openSignInPanel(document.querySelector("#account-bar"));
});

document.querySelector("#stats-sign-in-button").addEventListener("click", () => {
  openSignInPanel(document.querySelector("#stats-guest"));
});

// Passkeys (US-084). WebAuthn's binary fields travel as base64url text, in the JSON of webauthn-rs: options come in
// a "publicKey" wrapper, and answers carry their extension results as "extensions".
function fromBase64url(text) {
  const binary = window.atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64url(buffer) {
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// A step of a ceremony that the server refused, with the response's status.
class CeremonyRefused extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function ceremonyStep(url, options = {}) {
  const response = await fetch(url, withCsrfToken({ method: "POST", ...options }));
  if (!response.ok) throw new CeremonyRefused(response.status);
  return response;
}

function jsonBody(value) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

// The untranslated message for a ceremony that failed. The server never says why a passkey was refused, and a
// cancelled browser dialog reads the same.
function ceremonyFailure(error) {
  if (error instanceof CeremonyRefused) {
    if (error.status === 429) return "Too many attempts. Please try again later.";
    if (error.status === 400 || error.status === 401) return "Sign-in did not complete. Please try again.";
    return "Something went wrong. Please try again.";
  }
  if (error instanceof DOMException) return "Sign-in did not complete. Please try again.";
  return "Something went wrong. Please try again.";
}

// Creates the account's one passkey; the server then signs the browser in. The pseudonym is in the interface's
// language.
async function signUpWithPasskey() {
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-up/options", {
    body: new URLSearchParams({ language })
  })).json();
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      user: { ...options.user, id: fromBase64url(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((known) => ({ ...known, id: fromBase64url(known.id) }))
    }
  });
  const { response } = credential;
  await ceremonyStep("/api/passkeys/sign-up", jsonBody({
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    response: {
      attestationObject: toBase64url(response.attestationObject),
      clientDataJSON: toBase64url(response.clientDataJSON)
    },
    type: credential.type,
    extensions: credential.getClientExtensionResults()
  }));
}

// Signs in with a passkey. A signed-in player is offered only their own account's passkey.
async function signInWithPasskey() {
  // The passkey says whose it is: no credential is named, and the browser shows its own passkey dialog.
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-in/options")).json();
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((known) => ({ ...known, id: fromBase64url(known.id) }))
    }
  });
  const { response } = credential;
  await ceremonyStep("/api/passkeys/sign-in", jsonBody({
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
  }));
}

async function runCeremony(ceremony) {
  const status = document.querySelector("#sign-in-status");
  const buttons = [passkeySignIn, passkeySignUp, passkeyConfirm];
  status.textContent = "";
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await ceremony();
  } catch (error) {
    status.textContent = t(ceremonyFailure(error));
    return;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
  signInPanel.hidden = true;
  signInToggle.setAttribute("aria-expanded", "false");
  await loadAccount();
  renderView();
}

passkeySignIn.addEventListener("click", () => runCeremony(signInWithPasskey));
passkeySignUp.addEventListener("click", () => showSignUpWarning(passkeyWarning.hidden));
passkeyConfirm.addEventListener("click", () => runCeremony(signUpWithPasskey));

// "Your data" in Settings (US-081, US-082): download a copy, or delete the account after a recent sign-in.
function showAccountNotice(text) {
  const bar = document.querySelector("#account-bar");
  bar.querySelector(".account-notice")?.remove();
  const notice = document.createElement("p");
  notice.className = "account-notice";
  notice.setAttribute("role", "status");
  notice.textContent = text;
  bar.prepend(notice);
  bar.hidden = false;
}

function attachmentName(response) {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match ? match[1] : "beelot-data.json";
}

document.querySelector("#export-data").addEventListener("click", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#export-message");
  message.textContent = "";
  try {
    const response = await fetch("/api/account/export");
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      message.textContent = t("You can download your data again in {0} minutes.", body.minutesLeft ?? 60);
      return;
    }
    if (!response.ok) throw new Error(String(response.status));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = attachmentName(response);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {
    message.textContent = t("Something went wrong. Please try again.");
  }
});

const deleteConfirm = document.querySelector("#delete-confirm");
const deleteWord = document.querySelector("#delete-confirm-word");
const deleteButton = document.querySelector("#delete-confirm-button");

function showDeleteConfirm() {
  deleteConfirm.hidden = false;
  deleteWord.value = "";
  deleteButton.disabled = true;
  document.querySelector("#delete-message").textContent = "";
  deleteWord.focus();
}

document.querySelector("#delete-account").addEventListener("click", showDeleteConfirm);

document.querySelector("#delete-cancel").addEventListener("click", () => {
  deleteConfirm.hidden = true;
});

deleteWord.addEventListener("input", () => {
  deleteButton.disabled = deleteWord.value.trim().toLocaleUpperCase() !== t("DELETE");
});

deleteButton.addEventListener("click", async () => {
  const message = document.querySelector("#delete-message");
  message.textContent = "";
  deleteButton.disabled = true;
  try {
    const response = await fetch("/api/account", withCsrfToken({ method: "DELETE" }));
    if (response.status === 204) {
      deleteConfirm.hidden = true;
      navigate("/");
      await loadAccount();
      showAccountNotice(t("Your account has been deleted."));
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 403 && body.reason === "reauthenticate") {
      message.textContent = t("For your safety, sign in again to delete your account.");
      try {
        await signInWithPasskey();
      } catch (error) {
        message.textContent = t(ceremonyFailure(error));
        deleteButton.disabled = false;
        return;
      }
      await loadAccount();
      showDeleteConfirm();
      return;
    }
    throw new Error(String(response.status));
  } catch (_) {
    message.textContent = t("Something went wrong. Please try again.");
    deleteButton.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    await fetch("/api/sign-out", withCsrfToken({ method: "POST" }));
  } catch (_) {
    // The session may already be gone; return home.
  }
  window.location.assign("/");
});
renderView();
applySettings();
loadAccount();
