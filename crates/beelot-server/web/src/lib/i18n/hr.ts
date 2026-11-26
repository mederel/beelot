// Croatian (US-218): the English text is the key (see i18n.svelte.ts). It covers the screens a Bela player uses: home, setup, the
// auction, the table, the rules and the settings. A text it has not got shows in English, as in every language. The Latin
// script also serves Bosnian and Serbian (Latin), see docs/superpowers/specs/2026-11-26-bela-design.md.
import type { Dictionary, Helpers, MessageTable, Params } from "./types";

export const hr: Dictionary = {
  // Document and navigation
  "Beelot — Play Belote": "Beelot — Igraj belot",
  "Start a game of Belote.": "Započni partiju belota.",
  "Beelot home": "Beelot početna",
  "Settings": "Postavke",
  "Main": "Glavno",
  "Play": "Igraj",
  "Crew": "Ekipa",
  "Progress": "Napredak",
  "Me": "Ja",
  "Menu": "Izbornik",
  "Back": "Natrag",

  // Home
  "Deal in.": "Podijeli karte.",
  "Quick game": "Brza igra",
  "Play now": "Igraj odmah",
  "Bring the crew": "Pozovi ekipu",
  "Learn the basics": "Nauči osnove",
  "Tutorial": "Vodič",
  "Daily deal": "Dnevno dijeljenje",
  "Leaderboard": "Ljestvica",
  "Table talk": "Pravila igre",

  // Setup
  "Mode": "Način",
  "Solo": "Solo",
  "Pass and play": "Igra na jednom uređaju",
  "Players": "Igrači",
  "Game variant": "Varijanta igre",
  "Variant": "Varijanta",
  "Classic Belote": "Klasični belot",
  "Contrée": "Contrée",
  "Bela": "Bela",
  "Bot difficulty": "Težina botova",
  "Relaxed": "Opušteno",
  "Challenging": "Zahtjevno",
  "More rules": "Više pravila",
  "Match target": "Cilj partije",
  "Announcements": "Zvanja",
  "On": "Uključeno",
  "Off": "Isključeno",
  "Your name": "Tvoje ime",
  "Find a game": "Pronađi igru",
  "Open the rules and card order": "Otvori pravila i redoslijed karata",
  "Simple bid on the turned-up card": "Jednostavna licitacija na otvorenu kartu",
  "Auction from 80 to 160, with coinche": "Licitacija od 80 do 160, s kontrom",
  "Name the trump or say dalje, as in Croatia": "Zovi aduta ili reci dalje, kao u Hrvatskoj",

  // Auction
  "Pass": "Dalje",
  "Choose a trump suit": "Odaberi adut",
  "Name the trump suit or say dalje": "Zovi aduta ili reci dalje",
  "The dealer may not say dalje: name the trump suit": "Djelitelj ne smije reći dalje: mora zvati aduta",
  "Dalje: you pass the choice of trumps to the next player. The dealer may not pass.": "Dalje: izbor aduta prepuštaš sljedećem igraču. Djelitelj ne smije proći.",
  "Trump suit": "Adut",
  "Bidding so far": "Dosadašnji pozivi",
  "Waiting for {0}…": "Čekam {0}…",
  "Clubs": "Tref",
  "Diamonds": "Karo",
  "Hearts": "Herc",
  "Spades": "Pik",

  // Table
  "Your turn to play": "Na tebi je red za igru",
  "Your turn to bid": "Na tebi je red za zvanje",
  "{0}, your turn to play": "{0}, na tebi je red za igru",
  "{0}, your turn to bid": "{0}, na tebi je red za zvanje",
  "{0} is thinking…": "{0} razmišlja…",
  "{0} takes the trick": "{0} nosi štih",
  "Round over": "Kraj runde",
  "North–South": "Sjever–Jug",
  "East–West": "Istok–Zapad",
  "Trick": "Štih",
  "Score": "Rezultat",
  "Rematch": "Revanš",
  "Leave table": "Napusti stol",
  "Leave": "Napusti",
  "Stay": "Ostani",
  "Follow the suit led: {0}": "Slijedi boju: {0}",
  "You must trump.": "Moraš rezati.",
  "Play a higher trump.": "Odigraj višeg aduta.",
  "Play a higher card.": "Odigraj višu kartu.",

  // Rules
  "Bela variant": "Bela",
  "Bela, as played in Croatia, Bosnia and Serbia, deals six cards to each player. Starting left of the dealer, each player names the trump suit or says dalje (pass); the first to name a suit calls it and two more cards are dealt to everyone. The dealer may not pass.":
    "Bela, kako se igra u Hrvatskoj, Bosni i Srbiji, dijeli svakom igraču šest karata. Od igrača nakon djelitelja svatko zove aduta ili kaže dalje; tko prvi pozove boju, zvao je, a svima se dijele još dvije karte. Djelitelj ne smije reći dalje.",
  "Declarations (zvanje) are always played, with the same values as the announcements above, and the king and queen of trumps are the bela, 20 points. The calling team must score more than its opponents, or it is pad: the opponents score all 162 points and every declaration. A team that takes all eight tricks makes štiglja and scores 252. Bela is played to 1,000 points by default.":
    "Zvanja su uvijek u igri, s istim vrijednostima kao gore, a kralj i dama aduta su bela, 20 bodova. Tim koji je zvao mora osvojiti više od protivnika, inače pada: protivnici dobivaju svih 162 boda i sva zvanja. Tim koji osvoji svih osam štihova igra štigliju i dobiva 252. Bela se prema zadanim postavkama igra do 1000 bodova.",

  // Settings
  "Language": "Jezik",
  "Sound": "Zvuk"
};

export const hrMessages: MessageTable = {
  "call-pass": "Dalje",
  "auction-dealt-bela": "Podijeljeno je šest karata. Zovi aduta ili reci dalje.",
  "dealer-must-choose-trump": "Djelitelj ne smije reći dalje: zovi aduta.",
  "auction-deciding": (p: Params, h: Helpers) => (h.you(p.name) ? "Razmišljaš." : `${p.name} razmišlja.`),
  "call-trump": (p: Params, h: Helpers) => h.suit(p.trump),
  "declared-belote": (p: Params, h: Helpers) => `${h.you(p.name) ? "Zoveš" : `${p.name} zove`} belu.`,
  "declared-rebelote": (p: Params, h: Helpers) => `${h.you(p.name) ? "Zoveš" : `${p.name} zove`} belu: 20 bodova.`
};
