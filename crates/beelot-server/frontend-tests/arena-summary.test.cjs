// The bot benchmark's comment (.github/scripts/arena-summary.mjs, US-211): the two arena reports of a pull request, read and
// compared.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "../../../.github/scripts/arena-summary.mjs");

function section(variant, { difference, margin, won = 66, played = 80, low = 72.7, high = 89.3 }) {
  const sign = difference >= 0 ? "+" : "";
  const matches = played === 0 ? "n/a (0/0)" : `${((100 * won) / played).toFixed(1)}% (${won}/${played}), 95% CI ${low}%–${high}%`;
  return `Bot arena — ${variant}
current vs baseline, 10000 duplicate deal pairs, seed 1, announcements on, tout-atout and sans-atout on

Point difference per deal (current − baseline): ${sign}${difference.toFixed(2)} ± ${margin.toFixed(2)} (95% CI x to y)
Matches to 1,000 won by current: ${matches}
Contract success: current 80.1% (571/713); baseline n/a (0/0)
Decision time per card: current avg 1.6 µs, p99 5.2 µs; baseline avg 1.6 µs, p99 5.1 µs
`;
}

function run(base, pr) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-summary-"));
  const files = [base, pr].map((text, i) => {
    const file = path.join(dir, `report${i}.txt`);
    fs.writeFileSync(file, text);
    return file;
  });
  const result = spawnSync("node", [script, ...files], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true });
  return result;
}

const classic = (o) => section("Classic Belote", o);
const contree = (o) => section("Contrée", o);

test("a stronger bot is better, a weaker one worse, a close one within the noise", () => {
  const base = classic({ difference: 20, margin: 3 }) + "\n" + contree({ difference: 50, margin: 4 });
  const pr = classic({ difference: 30, margin: 3 }) + "\n" + contree({ difference: 20, margin: 4 });
  const { status, stdout } = run(base, pr);
  assert.equal(status, 0);
  assert.match(stdout, /Classic Belote[^\n]*\n(.*\n)*.*\*\*better\*\*/);
  assert.match(stdout, /Contrée[^\n]*\n(.*\n)*.*\*\*worse\*\*/);
  const same = run(base, base).stdout;
  assert.equal((same.match(/within the noise/g) ?? []).length, 2);
});

test("the noise is the two margins in quadrature: 5 points of change with two margins of 4 is within it, 6 is not", () => {
  const base = classic({ difference: 20, margin: 4 });
  assert.match(run(base, classic({ difference: 25, margin: 4 })).stdout, /within the noise/);
  assert.match(run(base, classic({ difference: 26, margin: 4 })).stdout, /\*\*better\*\*/);
});

test("the table shows both runs and the signed change", () => {
  const { stdout } = run(classic({ difference: 20, margin: 3 }), classic({ difference: 17.5, margin: 3.1 }));
  assert.match(stdout, /\| `main` \| \+20\.00 ± 3\.00 \| 82\.5% \(66\/80\)/);
  assert.match(stdout, /\| this pull request \| \+17\.50 ± 3\.10 \|/);
  assert.match(stdout, /\| change \| −2\.50 \|/);
  assert.match(stdout, /current vs baseline, 10000 duplicate deal pairs, seed 1/);
});

test("a section without matches shows n/a", () => {
  const { status, stdout } = run(classic({ difference: 20, margin: 3, played: 0 }), classic({ difference: 21, margin: 3, played: 0 }));
  assert.equal(status, 0);
  assert.match(stdout, /n\/a/);
});

test("a variant missing from one report, or a report that is not an arena's, fails with the reason", () => {
  const both = classic({ difference: 1, margin: 1 }) + "\n" + contree({ difference: 1, margin: 1 });
  const missing = run(both, classic({ difference: 1, margin: 1 }));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Contrée/);
  const garbage = run(both, "nothing here\n");
  assert.equal(garbage.status, 1);
  assert.match(garbage.stderr, /no arena report/i);
  const usage = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /usage/i);
});
