// Prints the record of a run: node real-devices/report.mjs <success|failure|cancelled> <version> <commit> <run url>
import { report } from "./lib.mjs";

const [outcome, version, commit, runUrl] = process.argv.slice(2);
const date = new Date().toISOString().slice(0, 10);
process.stdout.write(report({ outcome, date, version, commit, runUrl }));
