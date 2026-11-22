// Splits text into plain strings and suit-word parts so the page can draw a symbol next to each suit name. `words` maps
// a lower-case word to a suit key ("cœur" -> "hearts").
export type SuitTextPart = string | { suit: string; word: string };

export function splitSuitText(text: string | null | undefined, words: Record<string, string>): SuitTextPart[] {
  const keys = Object.keys(words).sort((a, b) => b.length - a.length);
  if (!text) return [];
  if (!keys.length) return [text];
  const escaped = keys.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}])(${escaped.join("|")})(?![\\p{L}])`, "giu");
  const parts: SuitTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ suit: words[match[0].toLowerCase()], word: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
