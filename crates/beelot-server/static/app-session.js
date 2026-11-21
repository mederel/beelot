// The resume record, policy and tutorial pages, the table API.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
// A solo match in progress is remembered on the device, and forgotten once it is over (US-122).
import { tutorialSteps, tutorialStep, viewForPath, tableSession, api, streamGap } from "./app-core.js";
import { setSuitText, cardElement } from "./app-solo-table.js";
import { announcementsLine } from "./app-table-ui.js";
import { readResume, rememberResume, forgetResume, resumeCard, readOnlineResumes, rememberOnlineResume, forgetOnlineResume, onlineResumeCard } from "./home-status.js";
import { language, t, cardName } from "./i18n.js";
import { showConnectionTrouble } from "./offline.js";
import { policyView, renderPolicy } from "./privacy-policy.js";
import { playSound } from "./sounds.js";

function rememberSoloMatch(snapshot) {
  if (snapshot.table.kind !== "LOCAL" || snapshot.table.passAndPlay) return;
  if (snapshot.match?.complete) forgetResume(window.localStorage);
  else rememberResume(window.localStorage, snapshot.tableId, tableSession(snapshot.tableId)?.playerToken);
}

// An online match at which this device holds a seat is remembered while it lasts, and forgotten once it is over (US-145).
function rememberOnlineMatch(snapshot) {
  if (onlineResumeCard(snapshot)) rememberOnlineResume(window.localStorage, snapshot.tableId, tableSession(snapshot.tableId)?.playerToken);
  else forgetOnlineResume(window.localStorage, snapshot.tableId);
}

// The online matches under the solo card, newest first. A match the server no longer knows, or that is over, is dropped;
// a network failure keeps the record. Only the table's own request is made.
async function loadOnlineResumeCards() {
  const list = document.querySelector("#resume-online");
  list.hidden = true;
  list.replaceChildren();
  const cards = [];
  for (const record of readOnlineResumes(window.localStorage)) {
    try {
      const model = onlineResumeCard(await api.table(record.tableId));
      if (model) cards.push(model);
      else forgetOnlineResume(window.localStorage, record.tableId);
    } catch (error) {
      if (error.status) forgetOnlineResume(window.localStorage, record.tableId);
    }
  }
  if (viewForPath(window.location.pathname) !== "home" || !cards.length) return;
  for (const model of cards) {
    const item = document.createElement("div");
    item.className = "resume-online-item";
    const link = document.createElement("a");
    link.className = "resume-card";
    link.setAttribute("href", model.path);
    const copy = document.createElement("span");
    copy.className = "resume-copy";
    const title = document.createElement("strong");
    title.textContent = t("Resume your match");
    const detail = document.createElement("small");
    detail.textContent = model.waiting
      ? t("{0} · waiting for players", t(model.variantLabel))
      : t("{0} · your team {1}, theirs {2}", t(model.variantLabel), model.yours, model.theirs);
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    copy.append(title, detail);
    link.append(copy, arrow);
    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "resume-forget";
    forget.textContent = "✕";
    forget.setAttribute("aria-label", t("Forget this match"));
    forget.addEventListener("click", () => {
      forgetOnlineResume(window.localStorage, model.tableId);
      item.remove();
      list.hidden = !list.childElementCount;
    });
    item.append(link, forget);
    list.append(item);
  }
  list.hidden = false;
}

// The "Resume your match" card of home: shown only when the server still knows the match and it is not over.
async function loadResumeCard() {
  const card = document.querySelector("#resume-card");
  card.hidden = true;
  loadOnlineResumeCards();
  const record = readResume(window.localStorage);
  if (!record) return;
  try {
    const model = resumeCard(await api.table(record.tableId));
    if (!model) {
      forgetResume(window.localStorage);
      return;
    }
    if (viewForPath(window.location.pathname) !== "home") return;
    card.setAttribute("href", model.path);
    document.querySelector("#resume-detail").textContent =
      t("{0} · your team {1}, theirs {2}", t(model.variantLabel), model.yours, model.theirs);
    card.hidden = false;
  } catch (error) {
    if (error.status) forgetResume(window.localStorage);
  }
}

// The policy text is one file in the three languages; the operator's own values come from the server's environment,
// and one that is unset reads "not configured".
async function loadPolicyInfo() {
  let policy = null;
  let info = {};
  try {
    const [policyResponse, infoResponse] = await Promise.all([fetch("/privacy-policy.json"), fetch("/api/privacy/policy-info")]);
    if (policyResponse.ok) policy = await policyResponse.json();
    if (infoResponse.ok) info = await infoResponse.json();
  } catch (_) { /* the page keeps what it shows */ }
  if (!policy) return;
  renderPolicy(policyView(policy, info, language, t("not configured")), document.querySelector("#privacy-policy"), document);
}

function showTutorialStep() {
  const step = tutorialSteps[tutorialStep];
  document.querySelector("#tutorial-progress").textContent = t("Lesson {0} of {1}", tutorialStep + 1, tutorialSteps.length);
  document.querySelector("#tutorial-title").textContent = t(step.title);
  setSuitText(document.querySelector("#tutorial-prompt"), t(step.prompt));
  setSuitText(document.querySelector("#tutorial-feedback"), t("Choose a card to continue."));
  document.querySelector("#tutorial-next-button").disabled = true;
  document.querySelector("#tutorial-next-button").textContent = t(tutorialStep === tutorialSteps.length - 1 ? "Finish tutorial" : "Next lesson");
  document.querySelector("#tutorial-cards").replaceChildren(...step.cards.map((card, index) => {
    const option = cardElement(card);
    option.classList.add("tutorial-card");
    option.tabIndex = 0;
    option.addEventListener("click", () => chooseTutorialCard(index));
    return option;
  }));
}

function chooseTutorialCard(index) {
  const step = tutorialSteps[tutorialStep];
  const cards = document.querySelectorAll("#tutorial-cards .tutorial-card");
  cards.forEach((card, cardIndex) => card.classList.toggle("tutorial-correct", cardIndex === step.correct));
  playSound(index === step.correct ? "correct" : "wrong");
  setSuitText(document.querySelector("#tutorial-feedback"), t(index === step.correct ? step.feedback : "Not quite. Look at the highlighted card, then try the next lesson."));
  document.querySelector("#tutorial-next-button").disabled = false;
}

// A signed-in player's requests that change state must echo the CSRF token the server sets in a cookie.
function withCsrfToken(options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return options;
  const token = document.cookie.split("; ").find((cookie) => cookie.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
  if (!token) return options;
  return { ...options, headers: { ...options.headers, "X-XSRF-TOKEN": decodeURIComponent(token) } };
}

// A request that gets no answer within this time is given up, so a bad connection never leaves the game waiting.
const requestTimeoutMs = 12000;
// Reading a table is safe to repeat: it is tried again after these pauses before the failure is shown.
const readRetryDelays = [500, 1500, 3500];

async function apiJsonOnce(url, options) {
  const control = new AbortController();
  const timer = window.setTimeout(() => control.abort(), requestTimeoutMs);
  let response;
  let body;
  try {
    response = await fetch(url, { ...withCsrfToken(options), signal: control.signal });
    body = await response.json().catch(() => ({}));
  } catch (cause) {
    // No answer (offline, dropped, or too slow): the request may or may not have reached the server.
    const error = new Error(t("The connection is slow or lost."));
    error.network = true;
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    const error = new Error(t(body.message ?? "Something went wrong. Please try again."));
    error.status = response.status;
    // A gateway or a restarting server answering for the game is a connection problem too.
    error.network = [502, 503, 504].includes(response.status);
    throw error;
  }
  return body;
}

async function apiJson(url, options = {}) {
  const readOnly = (options.method ?? "GET").toUpperCase() === "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const body = await apiJsonOnce(url, options);
      // An answer does not clear the note while the live stream is still down (US-142).
      if (!streamGap.isDropped()) showConnectionTrouble(false);
      return body;
    } catch (error) {
      if (error.network) showConnectionTrouble(true);
      if (!error.network || !readOnly || attempt >= readRetryDelays.length) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, readRetryDelays[attempt]));
    }
  }
}

// After a failed load, the screen stays where it is and loads again in a few seconds, instead of leaving the table.
let connectionRetryTimer = 0;
function retryOnNetworkError(error, retry) {
  if (!error?.network) return false;
  window.clearTimeout(connectionRetryTimer);
  connectionRetryTimer = window.setTimeout(retry, 3000);
  return true;
}

// Contrée (US-130): the bid is counted once, for the team that wins the contract, and shown as its own line.
function bidLine(round) {
  const team = round.northSouthBid > 0 ? "North–South" : round.eastWestBid > 0 ? "East–West" : null;
  return team ? ` ${t("Bid: {0} points go to {1}.", round.northSouthBid || round.eastWestBid, t(team))}` : "";
}

function roundScoreText(round, board) {
  const capot = !round.capotTeam ? "" : `${t("Capot! {0} take every trick and score 250.", t(round.capotTeam))} `;
  const detail = capot + t("North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.",
    round.northSouthCardPoints, round.northSouthDixDeDer, round.northSouthBeloteBonus, round.northSouthAwarded,
    round.eastWestCardPoints, round.eastWestDixDeDer, round.eastWestBeloteBonus, round.eastWestAwarded);
  const announcements = board.announcements ? ` ${announcementsLine(round, board)}` : "";
  return (board.coinched ? t("Coinche doubles the awarded scores. {0}", detail) : detail) + announcements + bidLine(round);
}

// Announcements (US-060): the option to declare on the first card, who declared during the first trick, what they
// declared once it is over, and the points in the round breakdown.
const carreRanks = { J: "jacks", 9: "nines", A: "aces", 10: "tens", K: "kings", Q: "queens" };
const sequenceNames = { TIERCE: "Tierce to the {0}", CINQUANTE: "Cinquante to the {0}", CENT: "Cent to the {0}" };

function announcementName(announcement) {
  return announcement.kind === "CARRE"
    ? t("Carré of {0}", t(carreRanks[announcement.cards[0].rank]))
    : t(sequenceNames[announcement.kind], cardName(announcement.topCard));
}

export { apiJson, loadResumeCard, loadPolicyInfo, showTutorialStep, rememberSoloMatch, retryOnNetworkError, roundScoreText, rememberOnlineMatch, announcementName, withCsrfToken };
