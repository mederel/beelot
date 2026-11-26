export type Language = "en" | "fr" | "nl" | "hr" | "bg";
export type Dictionary = Record<string, string>;
export type Params = Record<string, any>;
// `you(name)` is true for the built-in "You" seat; `suit(word, capitalise)` is a suit or contract word in the language.
export interface Helpers {
  you: (name: string) => boolean;
  suit: (word: string, capitalise?: boolean) => string;
}
export type MessageText = string | ((params: Params, helpers: Helpers) => string);
export type MessageTable = Record<string, MessageText>;
// A text the server sends as a code (US-170).
export interface Coded {
  code: string;
  params?: Params;
}
