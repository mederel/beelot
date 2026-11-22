// Client-side localisation. The English text is the key; a missing entry falls back to English. French is the default
// language and a language chosen in Settings takes precedence (stored as `beelot.language`). The language is reactive:
// every text read through `t()` in a component follows a change at once, without reloading the page. Only the dictionary
// of the language in use is downloaded: the page loads it before it starts (main.ts), and a change loads the new one first.
import { KEYS, local } from "$lib/storage";
import { englishMessages } from "./messages";
import type { Coded, Dictionary, Language, MessageTable, Params } from "./types";

export type { Coded, Language } from "./types";

export const LANGUAGES: Language[] = ["en", "fr", "nl"];

interface Locale {
  dictionary: Dictionary;
  // The texts of the server's codes, downloaded with the dictionary.
  messages: MessageTable;
  suits: Record<string, string>;
  rankLabels: Record<string, string>;
  cardName: (rank: string, suit: string) => string;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const frenchRankNames: Record<string, string> = { A: "as", K: "roi", Q: "dame", J: "valet" };
const dutchRankNames: Record<string, string> = { A: "aas", K: "heer", Q: "vrouw", J: "boer" };

const dictionaries: Record<Exclude<Language, "en">, () => Promise<{ dictionary: Dictionary; messages: MessageTable }>> = {
  fr: () => import("./fr").then((module) => ({ dictionary: module.fr, messages: module.frMessages })),
  nl: () => import("./nl").then((module) => ({ dictionary: module.nl, messages: module.nlMessages }))
};

const locales: Record<Language, Locale | null> = {
  en: null,
  fr: {
    dictionary: {},
    messages: {},
    suits: { clubs: "trèfle", diamonds: "carreau", hearts: "cœur", spades: "pique", "all trumps": "tout atout", "no trumps": "sans atout" },
    rankLabels: { A: "A", K: "R", Q: "D", J: "V" },
    cardName: (rank, suit) => capitalise(`${frenchRankNames[rank] ?? rank} de ${suit}`)
  },
  nl: {
    dictionary: {},
    messages: {},
    suits: { clubs: "klaveren", diamonds: "ruiten", hearts: "harten", spades: "schoppen", "all trumps": "alles troef", "no trumps": "geen troef" },
    rankLabels: { A: "A", K: "H", Q: "V", J: "B" },
    // Faces read as one word ("Hartenboer"), pip cards as "Harten 10".
    cardName: (rank, suit) => capitalise(dutchRankNames[rank] ? `${suit}${dutchRankNames[rank]}` : `${suit} ${rank}`)
  }
};

function detectLanguage(): Language {
  const stored = local.getItem(KEYS.language);
  return LANGUAGES.includes(stored as Language) ? (stored as Language) : "fr";
}

const state = $state({ language: detectLanguage() });

export function language(): Language {
  return state.language;
}

// Loads the dictionary of a language once (English has none: its texts are the keys).
export async function loadLanguage(lang: Language): Promise<void> {
  const locale = locales[lang];
  if (lang === "en" || !locale || Object.keys(locale.dictionary).length) return;
  const loaded = await dictionaries[lang]();
  locale.messages = loaded.messages;
  locale.dictionary = loaded.dictionary;
}

export async function setLanguage(next: Language): Promise<void> {
  if (!LANGUAGES.includes(next) || next === state.language) return;
  await loadLanguage(next).catch(() => {});
  local.setItem(KEYS.language, next);
  state.language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

function locale(lang: Language = state.language): Locale | null {
  return locales[lang];
}

// `t("Win {0} of {1}", a, b)`: the text in the language, with its placeholders filled.
export function t(text: string, ...args: unknown[]): string {
  const out = locale()?.dictionary[text] ?? text;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)])) : out;
}

// Whether the language has its own text for this key (the translation tests use it).
export function translated(text: string, lang: Language): boolean {
  return lang === "en" || Object.hasOwn(locales[lang]!.dictionary, text);
}

// Suit names arrive as enum values (HEARTS, NO_TRUMPS) or display names (Hearts, No trumps).
function suitNameIn(lang: Language, suit: string | null | undefined, capitalised = true): string {
  if (!suit) return "";
  const key = String(suit).toLowerCase().replace("_", " ");
  const name = locales[lang]?.suits[key] ?? key;
  return capitalised ? capitalise(name) : name;
}

export function suitName(suit: string | null | undefined, capitalised = true): string {
  return suitNameIn(state.language, suit, capitalised);
}

// A text the server sent as a code, in `lang`; null when the language has no text for the code (or has not been loaded yet). The built-in "You"
// seat gets the verb forms of its own ("Vous annoncez").
export function renderMessage(code: string, params: Params = {}, lang: Language = state.language): string | null {
  const text = (lang === "en" ? englishMessages : locales[lang]?.messages)?.[code];
  if (text === undefined) return null;
  const helpers = { you: (name: string) => name === "You", suit: (word: string, cap?: boolean) => suitNameIn(lang, word, cap) };
  return typeof text === "function" ? text(params, helpers) : text;
}

// A text the server sent as `{ code, params }`, in the language of the page. A code this page does not know, from a newer
// server, shows the English sentence that came with it.
export function localized(coded: Coded | null | undefined, english = ""): string {
  return (coded?.code && renderMessage(coded.code, coded.params ?? {})) || t(english);
}

// The English lower-case key of a suit name in any form (HEARTS, Hearts, Cœur): the same for a suit in every language.
export function suitKey(text: string | null | undefined): string {
  const word = String(text ?? "")
    .toLowerCase()
    .replace("_", " ");
  return Object.entries(locale()?.suits ?? {}).find(([, name]) => name.toLowerCase() === word)?.[0] ?? word;
}

// Every suit word the page may show (the language's and English), lower case, mapped to its suit key.
export function suitWordMap(): Record<string, string> {
  const words: Record<string, string> = {};
  for (const names of [locale()?.suits, { clubs: "clubs", diamonds: "diamonds", hearts: "hearts", spades: "spades" }]) {
    for (const suit of ["clubs", "diamonds", "hearts", "spades"]) {
      const name = names?.[suit];
      if (name) words[name.toLowerCase()] = suit;
    }
  }
  return words;
}

export function rankLabel(rank: string): string {
  return locale()?.rankLabels[rank] ?? rank;
}

export function cardName(card: { rank: string; suit: string }): string {
  const suit = suitName(card.suit, false);
  const current = locale();
  return current ? current.cardName(card.rank, suit) : `${card.rank} of ${suit}`;
}

// A player's own name is shown as typed; the built-in "You" seat and a deleted player's seat are localised.
export function playerName(name: string | null | undefined): string {
  if (!name) return "";
  return name === "You" || name === "Deleted player" ? t(name) : name;
}

export function formatNumber(value: number | string): string {
  return Number(value).toLocaleString(state.language);
}

if (typeof document !== "undefined") document.documentElement.lang = state.language;
