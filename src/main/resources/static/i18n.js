// Lightweight client-side localisation. English source text is the key; a missing entry falls back to English.
// French is the default; a language chosen in Settings takes precedence.
const languageKey = "beelot.language";
const supportedLanguages = ["en", "fr"];

function detectLanguage() {
  try {
    const stored = window.localStorage.getItem(languageKey);
    if (supportedLanguages.includes(stored)) return stored;
  } catch (_) { /* storage unavailable */ }
  return "fr";
}

const language = detectLanguage();

const frenchSuits = { clubs: "trèfle", diamonds: "carreau", hearts: "cœur", spades: "pique" };
const frenchRankNames = { A: "as", K: "roi", Q: "dame", J: "valet" };
const frenchRankLabels = { A: "A", K: "R", Q: "D", J: "V" };

const fr = {
  // Document
  "Beelot — Play Belote": "Beelot — Jouer à la belote",
  "Start a game of Belote.": "Lancez une partie de belote.",
  "Beelot home": "Accueil Beelot",
  "Settings": "Paramètres",
  "Game highlights": "Points forts du jeu",
  "Game modes": "Modes de jeu",

  // Home
  "Belote, remixed ✨": "La belote, en version remix ✨",
  "Deal in.": "À la donne.",
  "Good times": "Les bons moments",
  "await.": "vous attendent.",
  "Quick games, clever plays and big table energy. Challenge our AI or bring your favourite people.":
    "Parties rapides, coups malins et grosse ambiance de tablée. Défiez notre IA ou invitez vos proches.",
  "⚡ Jump in instantly": "⚡ Jouez tout de suite",
  "♣ Classic & Contrée": "♣ Classique et Contrée",
  "♥ Better with friends": "♥ Meilleur entre amis",
  "Quick game": "Partie rapide",
  "Grab a seat and take on three lively AI players.": "Prenez place face à trois joueurs IA pleins d'entrain.",
  "Bring the crew": "Réunissez la bande",
  "Open a private table and invite your favourite rivals.": "Ouvrez une table privée et invitez vos rivaux préférés.",
  "Learn the moves": "Apprenez les bases",
  "Master trump and tricks without the pressure.": "Maîtrisez l'atout et les plis sans pression.",
  "Table talk": "Parlons règles",
  "Everything you need to settle a rules debate.": "Tout pour trancher un débat sur les règles.",
  "Shuffle up, team up, and race to 1,000 points.": "Battez les cartes, faites équipe et visez les 1 000 points.",

  // AI setup
  "Your table is ready ⚡": "Votre table est prête ⚡",
  "Pick your vibe.": "Choisissez votre style.",
  "Choose your flavour of Belote and how spicy you want the competition.":
    "Choisissez votre belote et le niveau de piquant de l'adversaire.",
  "Game variant": "Variante",
  "Classic Belote": "Belote classique",
  "Contrée": "Contrée",
  "Traditional upcard bidding.": "Enchères traditionnelles sur la carte retournée.",
  "Contract auction with coinche.": "Enchères de contrat avec coinche.",
  "AI difficulty": "Difficulté de l'IA",
  "Relaxed": "Détendu",
  "A gentler game to learn and practise.": "Une partie plus douce pour apprendre et s'entraîner.",
  "Challenging": "Exigeant",
  "More demanding opponents for experienced players.": "Des adversaires plus coriaces pour les joueurs expérimentés.",
  "Deal the cards": "Distribuer les cartes",
  "Back to game modes": "Retour aux modes de jeu",

  // AI game
  "AI card room": "Salle de cartes IA",
  "AI ·": "IA ·",
  "Team scores": "Scores des équipes",
  "North–South": "Nord–Sud",
  "East–West": "Est–Ouest",
  "VS": "VS",
  "Game status": "État de la partie",
  "Trump": "Atout",
  "Contract": "Contrat",
  "Turn": "Tour",
  "Four-player card table": "Table de cartes à quatre joueurs",
  "Trick": "Pli",
  "Play the opening card": "Jouez la première carte",
  "Your eight cards": "Vos huit cartes",
  "Your five cards": "Vos cinq cartes",
  "Collect trick": "Ramasser le pli",
  "Deal next round": "Donner la manche suivante",
  "Rematch": "Revanche",
  "Rules reference": "Rappel des règles",
  "Leave table": "Quitter la table",

  // Bidding
  "Choose trump": "Choisir l'atout",
  "Make your call.": "Faites votre annonce.",
  "Bidding table with four players": "Table d'enchères à quatre joueurs",
  "Upturned card": "Carte retournée",
  "Your five-card hand": "Votre main de cinq cartes",
  "Your eight-card hand": "Votre main de huit cartes",
  "Accept upturned suit": "Prendre à la couleur retournée",
  "Pass": "Passer",
  "Choose a trump suit": "Choisissez une couleur d'atout",
  "Clubs ♣": "Trèfle ♣",
  "Diamonds ♦": "Carreau ♦",
  "Hearts ♥": "Cœur ♥",
  "Spades ♠": "Pique ♠",
  "No contract yet": "Pas encore de contrat",
  "Contract value": "Valeur du contrat",
  "Trump suit": "Couleur d'atout",
  "Make bid": "Annoncer",
  "Coinche": "Coinche",
  "Coinche!": "Coinche !",
  "{0} passes.": "{0} passe.",
  "{0} takes with {1}.": "{0} prend à {1}.",
  "Contrée auction": "Enchères de Contrée",
  "Current contract: {0} {1} by {2}": "Contrat actuel : {0} {1} par {2}",

  // Private tables
  "Friends, rivals, legends ♥": "Amis, rivaux, légendes ♥",
  "Bring the crew.": "Réunissez la bande.",
  "Make a room in seconds or use a six-character invite to jump into the fun.":
    "Créez une salle en quelques secondes ou utilisez un code d'invitation à six caractères pour rejoindre la fête.",
  "Create a table": "Créer une table",
  "Your name": "Votre nom",
  "Player": "Joueur",
  "Create private table": "Créer une table privée",
  "Join friends": "Rejoindre des amis",
  "Invitation code": "Code d'invitation",
  "Join table": "Rejoindre la table",
  "Private table": "Table privée",
  "Gather your team.": "Rassemblez votre équipe.",
  "Copy": "Copier",
  "Copied": "Copié",
  "Private table seats": "Places de la table privée",
  "Turn timer": "Minuteur de tour",
  "No timer": "Sans minuteur",
  "30 seconds": "30 secondes",
  "60 seconds": "60 secondes",
  "Save": "Enregistrer",
  "I am ready": "Je suis prêt",
  "Not ready": "Pas prêt",
  "Start game": "Lancer la partie",
  "Start now with bots": "Lancer maintenant avec des bots",
  "Auction": "Enchères",
  "Private game status": "État de la partie privée",
  "Declaring team": "Équipe déclarante",
  "Private team scores": "Scores des équipes (table privée)",
  "Four-player private card table": "Table de cartes privée à quatre joueurs",
  "Your cards": "Vos cartes",
  "Current trick": "Pli en cours",
  "Bid": "Annoncer",
  "Game started": "Partie commencée",
  "(you)": "(vous)",
  "You": "Vous",
  "{0} (you)": "{0} (vous)",
  "Ready": "Prêt",
  "Waiting": "En attente",
  "AI takeover": "Repris par l'IA",
  "Disconnected": "Déconnecté",
  "Connected": "Connecté",
  "Four players must be ready before the table owner can start the game, or the owner can start now and fill empty seats with bots.":
    "Quatre joueurs doivent être prêts pour que le propriétaire de la table lance la partie, ou bien il peut démarrer tout de suite et remplir les places vides avec des bots.",
  "Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by AI.":
    "Minuteur de tour : {0} secondes. Un avertissement apparaît à 10 secondes de la fin ; un tour expiré est joué par l'IA.",
  "Turn timer is disabled.": "Le minuteur de tour est désactivé.",
  "Variant: {0}": "Variante : {0}",
  "The game has started. Calls and card play update for every player automatically.":
    "La partie a commencé. Les annonces et les cartes jouées se mettent à jour automatiquement pour tous les joueurs.",
  "That table is no longer available.": "Cette table n'est plus disponible.",
  "No upturned card in Contrée.": "Pas de carte retournée en Contrée.",
  "Something went wrong. Please try again.": "Une erreur est survenue. Veuillez réessayer.",

  // Tutorial
  "Learn Belote": "Apprendre la belote",
  "Tutorial": "Tutoriel",
  "Next lesson": "Leçon suivante",
  "Finish tutorial": "Terminer le tutoriel",
  "Replay tutorial": "Rejouer le tutoriel",
  "Lesson {0} of {1}": "Leçon {0} sur {1}",
  "Choose a card to continue.": "Choisissez une carte pour continuer.",
  "Not quite. Look at the highlighted card, then try the next lesson.":
    "Pas tout à fait. Regardez la carte en surbrillance, puis passez à la leçon suivante.",
  "Trump wins": "L'atout l'emporte",
  "Hearts are trump. Which card is strongest?": "Cœur est atout. Quelle carte est la plus forte ?",
  "Correct. At trump, the jack is the strongest card.": "Exact. À l'atout, le valet est la carte la plus forte.",
  "Normal card strength": "Force des cartes ordinaires",
  "Clubs are not trump. Which card wins this trick?": "Trèfle n'est pas atout. Quelle carte remporte ce pli ?",
  "Correct. Outside trump, ace is stronger than 10.": "Exact. Hors atout, l'as est plus fort que le 10.",
  "Follow suit": "Fournir la couleur",
  "Hearts were led. Which card must you play if these are your choices?":
    "Cœur a été demandé. Quelle carte devez-vous jouer si vous avez ce choix ?",
  "Correct. You must follow the lead suit when you can.": "Exact. Vous devez fournir la couleur demandée quand vous le pouvez.",
  "Take the trick": "Prendre le pli",
  "Spades are trump and clubs were led. Which card takes this trick?":
    "Pique est atout et trèfle a été demandé. Quelle carte prend ce pli ?",
  "Correct. A trump card beats cards in the lead suit.": "Exact. Un atout bat les cartes de la couleur demandée.",

  // Rules
  "Classic suit-trump Belote, played to 1,000 points. Tout-Atout and Sans-Atout are not part of this variant.":
    "Belote classique à atout couleur, jouée en 1 000 points. Le Tout-Atout et le Sans-Atout ne font pas partie de cette variante.",
  "Deal and trump": "Distribution et atout",
  "Each player receives five cards and one card is turned face up. First, accept that suit or pass. After all pass, choose another suit; a second all-pass redeals.":
    "Chaque joueur reçoit cinq cartes et une carte est retournée. Au premier tour, prenez cette couleur ou passez. Si tout le monde passe, choisissez une autre couleur ; un second tour où tout le monde passe entraîne une nouvelle donne.",
  "Card order": "Ordre des cartes",
  "At trump: jack, 9, ace, 10, king, queen, 8, 7. In other suits: ace, 10, king, queen, jack, 9, 8, 7.":
    "À l'atout : valet, 9, as, 10, roi, dame, 8, 7. Dans les autres couleurs : as, 10, roi, dame, valet, 9, 8, 7.",
  "Playing a card": "Jouer une carte",
  "Follow the lead suit when possible. If void and an opponent wins, trump and overtrump when able. If your partner wins, you may discard.":
    "Fournissez la couleur demandée quand c'est possible. Si vous n'en avez pas et qu'un adversaire est maître, coupez et surcoupez si vous le pouvez. Si votre partenaire est maître, vous pouvez vous défausser.",
  "Scoring": "Décompte",
  "Card points total 162, including 10 points for the last trick (Dix de der). The declaring team needs 82 points. King and queen of trump declare Belote/Rebelote for 20 points.":
    "Les cartes valent 162 points au total, dont 10 points pour le dernier pli (dix de der). L'équipe qui a pris doit faire 82 points. Le roi et la dame d'atout annoncent Belote/Rebelote pour 20 points.",
  "Contrée variant": "Variante Contrée",
  "All eight cards are dealt before an auction from 80 to 160, in steps of 10. Each call names a trump suit and must raise the current contract. Three passes after a bid close the auction. An opponent may coinche, doubling the round score; Belote/Rebelote remains active.":
    "Les huit cartes sont distribuées avant des enchères de 80 à 160, par pas de 10. Chaque annonce désigne une couleur d'atout et doit surenchérir sur le contrat en cours. Trois passes après une annonce closent les enchères. Un adversaire peut coincher, ce qui double le score de la manche ; la Belote/Rebelote reste valable.",

  // Settings
  "Preferences": "Préférences",
  "Language": "Langue",
  "Choose the language of the interface.": "Choisissez la langue de l'interface.",
  "Sound effects": "Effets sonores",
  "Enable optional game sounds.": "Activer les sons de jeu facultatifs.",
  "Reduce motion": "Réduire les animations",
  "Disable movement and transition effects.": "Désactiver les effets de mouvement et de transition.",
  "Cards always use both a suit symbol and colour. Controls support touch and keyboard use.":
    "Les cartes utilisent toujours à la fois un symbole et une couleur. Les commandes fonctionnent au toucher et au clavier.",

  // Game board (client-built)
  "Contract: {0} {1}{2}": "Contrat : {0} {1}{2}",
  " · coinched": " · coinché",
  "{0} are trump": "{0} est l'atout",
  "Contract made": "Contrat rempli",
  "Contract failed": "Contrat chuté",
  "Contract made.": "Contrat rempli.",
  "Contract failed.": "Contrat chuté.",
  "{0}'s turn · {1} of 8 tricks completed": "Au tour de {0} · {1} plis sur 8 terminés",
  "{0} win the match!": "{0} remporte la partie !",
  "Match score — North–South {0} · East–West {1}": "Score de la partie — Nord–Sud {0} · Est–Ouest {1}",
  " Belote/Rebelote bonus: {0} points.": " Bonus Belote/Rebelote : {0} points.",
  "Dealing the remaining cards…": "Distribution des cartes restantes…",
  "Dealer": "Donneur",
  "{0} · You": "{0} · Vous",
  "{0} · {1} AI": "{0} · IA : {1}",
  "{0}, {1}, {2}{3}": "{0}, {1}, {2}{3}",
  ", active player": ", joueur actif",
  "+{0} pts": "+{0} pts",
  "{0} wins the trick for {1} points": "{0} remporte le pli pour {1} points",
  "Play {0}": "Jouer {0}",
  "{0} of {1}": "{0} de {1}",
  "Coinche doubles the awarded scores. {0}": "La coinche double les scores attribués. {0}",
  "North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.":
    "Nord–Sud : {0} points de cartes + {1} de dix de der + {2} de Belote = {3}. Est–Ouest : {4} points de cartes + {5} de dix de der + {6} de Belote = {7}.",

  // Server messages
  "Eight cards have been dealt. Bid from 80 to 160 or pass.": "Huit cartes ont été distribuées. Annoncez de 80 à 160 ou passez.",
  "Five cards have been dealt. Accept the upturned suit or pass.": "Cinq cartes ont été distribuées. Prenez à la couleur retournée ou passez.",
  "Everyone passed. The cards have been redealt.": "Tout le monde a passé. Les cartes ont été redistribuées.",
  "Everyone passed twice. The cards have been redealt.": "Tout le monde a passé deux fois. Les cartes ont été redistribuées.",
  "AI game not found": "Partie IA introuvable",
  "This match has ended. Start a rematch.": "Cette partie est terminée. Lancez une revanche.",
  "The auction is still in progress.": "Les enchères sont toujours en cours.",
  "A Belote table needs four players.": "Une table de belote nécessite quatre joueurs.",
  "Choose a contract value and suit in Contrée.": "Choisissez une valeur et une couleur de contrat en Contrée.",
  "In the first round, you may only accept the upturned suit.": "Au premier tour, vous ne pouvez que prendre à la couleur retournée.",
  "Choose a suit other than the upturned suit.": "Choisissez une couleur autre que la couleur retournée.",
  "Choose a trump suit for the contract.": "Choisissez une couleur d'atout pour le contrat.",
  "A Contrée bid must be from 80 to 160 in steps of 10.": "Une annonce de Contrée doit aller de 80 à 160 par pas de 10.",
  "Your bid must be higher than the current contract.": "Votre annonce doit être supérieure au contrat en cours.",
  "Only an opponent of the declaring team may coinche.": "Seul un adversaire de l'équipe déclarante peut coincher.",
  "Contract bids are only available in Contrée.": "Les annonces de contrat n'existent qu'en Contrée.",
  "The auction has ended.": "Les enchères sont terminées.",
  "It is not your turn to bid.": "Ce n'est pas votre tour d'annoncer.",
  "The invitation code is invalid.": "Le code d'invitation est invalide.",
  "The auction has not finished.": "Les enchères ne sont pas terminées.",
  "You are not authorized for this table.": "Vous n'êtes pas autorisé à accéder à cette table.",
  "This game has not started.": "Cette partie n'a pas commencé.",
  "This table does not exist.": "Cette table n'existe pas.",
  "Enter a player name.": "Saisissez un nom de joueur.",
  "This table has already started.": "Cette table a déjà commencé.",
  "This table is full.": "Cette table est complète.",
  "An AI has taken over this seat for the rest of the match.": "Une IA a repris cette place pour le reste de la partie.",
  "Only the table owner can start the game.": "Seul le propriétaire de la table peut lancer la partie.",
  "Four ready players are required to start the game.": "Quatre joueurs prêts sont nécessaires pour lancer la partie.",
  "Every seated player must be ready to start with bots.": "Tous les joueurs assis doivent être prêts pour démarrer avec des bots.",
  "Only the table owner can change the turn timer.": "Seul le propriétaire de la table peut modifier le minuteur de tour.",
  "The turn timer cannot change after the game starts.": "Le minuteur de tour ne peut plus être modifié une fois la partie commencée.",
  "Choose no timer, 30 seconds, or 60 seconds.": "Choisissez sans minuteur, 30 secondes ou 60 secondes.",
  "You are not seated at this table.": "Vous n'êtes pas assis à cette table.",
  "It is not your turn to play.": "Ce n'est pas votre tour de jouer.",
  "That card is not a legal play.": "Cette carte n'est pas un coup légal.",
  "This round has ended.": "Cette manche est terminée.",
  "There is no completed trick to continue from.": "Il n'y a aucun pli terminé à ramasser.",
  "Unknown player": "Joueur inconnu"
};

const dictionaries = { fr };

// Server messages that embed names, suits or numbers. Handlers receive the regex captures.
const suitWord = "(CLUBS|DIAMONDS|HEARTS|SPADES|Clubs|Diamonds|Hearts|Spades)";
const serverPatterns = [
  [/^(.+) is deciding\.$/, (name) => (name === "You" ? "Vous réfléchissez." : `${name} réfléchit.`)],
  [new RegExp(`^(.+) bids (\\d+) ${suitWord}\\.$`), (name, value, suit) =>
    `${name === "You" ? "Vous annoncez" : `${name} annonce`} ${value} ${suitName(suit, false)}.`],
  [/^(.+) coinches the contract\.$/, (name) => `${name === "You" ? "Vous coinchez" : `${name} coinche`} le contrat.`],
  [new RegExp(`^The (\\d+) ${suitWord} contract is accepted\\.$`), (value, suit) =>
    `Le contrat de ${value} ${suitName(suit, false)} est accepté.`],
  [new RegExp(`^Everyone passed\\. Choose any trump suit except ${suitWord}\\.$`), (suit) =>
    `Tout le monde a passé. Choisissez n'importe quelle couleur d'atout sauf ${suitName(suit, false)}.`],
  [/^(.+) declares Belote\.$/, (name) => `${name === "You" ? "Vous annoncez" : `${name} annonce`} Belote.`],
  [/^(.+) declares Rebelote: 20 bonus points\.$/, (name) =>
    `${name === "You" ? "Vous annoncez" : `${name} annonce`} Rebelote : 20 points de bonus.`],
  [/^AI game not found: (.+)$/, () => "Partie IA introuvable."],
  [new RegExp(`^(\\d+) ${suitWord}$`), (value, suit) => `${value} ${suitName(suit)}`],
  [new RegExp(`^${suitWord}$`), (suit) => suitName(suit)],
  [/^(\d+) cards?$/, (count) => `${count} ${Number(count) <= 1 ? "carte" : "cartes"}`]
];

function translateServer(text) {
  for (const [pattern, handler] of serverPatterns) {
    const match = pattern.exec(text);
    if (match) return handler(...match.slice(1));
  }
  return null;
}

function t(text, ...args) {
  let out = text;
  if (language !== "en" && typeof text === "string") {
    out = dictionaries[language][text] ?? translateServer(text) ?? text;
  }
  return args.length ? out.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)]) : out;
}

// Suit names arrive as enum values (HEARTS) or display names (Hearts).
function suitName(suit, capitalise = true) {
  if (!suit) return "";
  const key = String(suit).toLowerCase();
  if (language === "en") return capitalise ? key.charAt(0).toUpperCase() + key.slice(1) : key;
  const name = frenchSuits[key] ?? key;
  return capitalise ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

function rankLabel(rank) {
  return language === "fr" ? frenchRankLabels[rank] ?? rank : rank;
}

function cardName(card) {
  const suit = suitName(card.suit, false);
  if (language === "en") return `${card.rank} of ${suit}`;
  return `${frenchRankNames[card.rank] ?? card.rank} de ${suit}`.replace(/^./, (letter) => letter.toUpperCase());
}

// A player's own name is shown as typed; the built-in "You" seat is localised.
function playerName(name) {
  return name === "You" ? t("You") : name;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Translates the static markup once at load. Dynamic text goes through t() in app.js.
function translateStaticMarkup() {
  document.documentElement.lang = language;
  if (language === "en") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement.closest("script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const source = collapseWhitespace(node.nodeValue);
    const translated = source && dictionaries[language][source];
    if (translated) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), () => translated);
  });
  document.querySelectorAll("[aria-label], [placeholder], [title]").forEach((element) => {
    ["aria-label", "placeholder", "title"].forEach((attribute) => {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, t(element.getAttribute(attribute)));
    });
  });
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("Start a game of Belote."));
  document.querySelectorAll("#owner-name, #join-name").forEach((input) => { input.value = t(input.value); });
}

function setLanguage(next) {
  if (!supportedLanguages.includes(next) || next === language) return;
  try { window.localStorage.setItem(languageKey, next); } catch (_) { /* storage unavailable */ }
  window.location.reload();
}

translateStaticMarkup();
