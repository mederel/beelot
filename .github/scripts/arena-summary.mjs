#!/usr/bin/env node
// Turns the reports of two bot arena runs (`beelot-arena --first current --second baseline`, one of the base commit and one of
// a pull request) into the Markdown comment of the bot benchmark (US-211).
//
// Usage: arena-summary.mjs BASE_REPORT PR_REPORT > comment.md
// Exits 1, with the reason on stderr, when a report cannot be read or the two do not play the same variants.
import { readFileSync } from "node:fs";

const MINUS = "−";

// The sections of a report, by variant name: the numbers the comment shows.
export function parseReport(text) {
  const sections = new Map();
  for (const part of text.split(/^Bot arena — /m).slice(1)) {
    const variant = part.split("\n", 1)[0].trim();
    const setup = part.split("\n")[1] ?? "";
    const difference = /^Point difference per deal \(.*\): ([+-]?\d+(?:\.\d+)?) ± (\d+(?:\.\d+)?)/m.exec(part);
    if (!difference) throw new Error(`the ${variant} section has no point difference`);
    const matches = /^Matches to 1,000 won by [^:]+: (.+)$/m.exec(part);
    const rate = matches && /^(\d+(?:\.\d+)?)% \((\d+)\/(\d+)\)/.exec(matches[1]);
    sections.set(variant, {
      setup,
      difference: Number(difference[1]),
      margin: Number(difference[2]),
      matches: rate ? { percent: Number(rate[1]), text: `${rate[1]}% (${rate[2]}/${rate[3]})` } : { percent: NaN, text: "n/a" }
    });
  }
  if (sections.size === 0) throw new Error("no arena report found");
  return sections;
}

const signed = (x, decimals) => `${x < 0 ? MINUS : "+"}${Math.abs(x).toFixed(decimals)}`;

// better / worse when the change of the point difference is beyond the two margins of error added in quadrature.
export function verdict(base, pr) {
  const change = pr.difference - base.difference;
  const noise = Math.hypot(base.margin, pr.margin);
  if (change > noise) return "better";
  if (change < -noise) return "worse";
  return "within the noise";
}

export function summarise(baseText, prText) {
  const base = parseReport(baseText);
  const pr = parseReport(prText);
  for (const variant of base.keys()) if (!pr.has(variant)) throw new Error(`${variant} is missing from the pull request's report`);
  for (const variant of pr.keys()) if (!base.has(variant)) throw new Error(`${variant} is missing from the base's report`);
  const rows = [];
  const verdicts = [];
  for (const [variant, before] of base) {
    const after = pr.get(variant);
    const change = after.difference - before.difference;
    const matchChange = after.matches.percent - before.matches.percent;
    const points = Number.isNaN(matchChange) ? "n/a" : `${signed(matchChange, 1)} points`;
    rows.push(
      `| ${variant} | \`main\` | ${signed(before.difference, 2)} ± ${before.margin.toFixed(2)} | ${before.matches.text} |`,
      `| | this pull request | ${signed(after.difference, 2)} ± ${after.margin.toFixed(2)} | ${after.matches.text} |`,
      `| | change | ${signed(change, 2)} | ${points} |`
    );
    verdicts.push(`- ${variant}: **${verdict(before, after)}**`);
  }
  const [first] = base.values();
  return [
    "## Bot benchmark",
    "",
    `The bot of \`main\` and the bot of this pull request, each against the \`baseline\` bot (${first.setup}).`,
    "",
    "| Variant | | Point difference per deal | Matches to 1,000 won |",
    "| --- | --- | --- | ---: |",
    ...rows,
    "",
    "Verdict, from the change of the point difference against both 95% margins of error:",
    "",
    ...verdicts,
    "",
    "The job reports, it does not fail on a weaker bot. To rerun it: `cargo run --release -p beelot-arena -- --first current --second baseline --deals 10000 --seed 1`.",
    ""
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basePath, prPath] = process.argv.slice(2);
  if (!basePath || !prPath || process.argv.length > 4) {
    console.error("usage: arena-summary.mjs BASE_REPORT PR_REPORT");
    process.exit(1);
  }
  try {
    process.stdout.write(summarise(readFileSync(basePath, "utf8"), readFileSync(prPath, "utf8")));
  } catch (error) {
    console.error(`arena-summary: ${error.message}`);
    process.exit(1);
  }
}
