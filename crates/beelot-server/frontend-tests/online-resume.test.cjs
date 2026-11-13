const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ONLINE_RESUME_KEY, readOnlineResumes, rememberOnlineResume, forgetOnlineResume, onlineResumeCard, readResume } = require("../static/home-status.js");

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

test("online records are written newest first, once per table, up to three", () => {
  const storage = memory();
  for (const id of ["a", "b", "c"]) rememberOnlineResume(storage, id, `tok-${id}`);
  assert.deepEqual(readOnlineResumes(storage).map((r) => r.tableId), ["c", "b", "a"]);
  rememberOnlineResume(storage, "a", "tok-a2");
  assert.deepEqual(readOnlineResumes(storage), [{ tableId: "a", playerToken: "tok-a2" }, { tableId: "c", playerToken: "tok-c" }, { tableId: "b", playerToken: "tok-b" }]);
  rememberOnlineResume(storage, "d", "tok-d");
  assert.deepEqual(readOnlineResumes(storage).map((r) => r.tableId), ["d", "a", "c"]);
});

test("a record is forgotten alone, and the last one removes the key", () => {
  const storage = memory();
  rememberOnlineResume(storage, "a", "x");
  rememberOnlineResume(storage, "b", "y");
  forgetOnlineResume(storage, "b");
  assert.deepEqual(readOnlineResumes(storage).map((r) => r.tableId), ["a"]);
  forgetOnlineResume(storage, "a");
  assert.equal(storage.getItem(ONLINE_RESUME_KEY), null);
});

test("blocked or damaged storage means nothing to resume, and it does not touch the solo record", () => {
  assert.doesNotThrow(() => { rememberOnlineResume(broken, "t", "k"); forgetOnlineResume(broken, "t"); });
  assert.deepEqual(readOnlineResumes(broken), []);
  const storage = memory();
  storage.setItem(ONLINE_RESUME_KEY, "{not json");
  assert.deepEqual(readOnlineResumes(storage), []);
  storage.setItem(ONLINE_RESUME_KEY, JSON.stringify([{ tableId: 1 }, { tableId: "ok", playerToken: "t" }]));
  assert.deepEqual(readOnlineResumes(storage), [{ tableId: "ok", playerToken: "t" }]);
  rememberOnlineResume(storage, "", "tok");
  assert.equal(readResume(storage), null);
});

const online = (over = {}) => ({ tableId: "t9", you: 2, table: { kind: "PRIVATE", status: "IN_PROGRESS", variantLabel: "Contrée" }, match: { northSouth: 150, eastWest: 90, target: 1000, complete: false }, ...over });

test("the card of an online match follows the viewer's team and the table's kind", () => {
  assert.deepEqual(onlineResumeCard(online()), { tableId: "t9", path: "/online/private/table/t9", variantLabel: "Contrée", waiting: false, yours: 150, theirs: 90, target: 1000 });
  const east = onlineResumeCard(online({ you: 1, table: { kind: "PUBLIC", status: "IN_PROGRESS", variantLabel: "Contrée" } }));
  assert.equal(east.path, "/online/public/table/t9");
  assert.equal(east.yours, 90);
});

test("a lobby is offered as waiting, with no match yet", () => {
  const card = onlineResumeCard(online({ match: undefined, table: { kind: "PRIVATE", status: "WAITING_FOR_PLAYERS", variantLabel: "Classic Belote" } }));
  assert.equal(card.waiting, true);
  assert.equal(card.yours, 0);
});

test("nothing to resume for a spectator, a finished match, a solo table or no table", () => {
  assert.equal(onlineResumeCard(online({ you: null })), null);
  assert.equal(onlineResumeCard(online({ you: undefined })), null);
  assert.equal(onlineResumeCard(online({ match: { complete: true } })), null);
  assert.equal(onlineResumeCard(online({ table: { kind: "LOCAL" } })), null);
  assert.equal(onlineResumeCard(null), null);
});

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const app = require("./app-source.cjs").appSource();

test("the online record follows the seat's life cycle and the home lists the cards", () => {
  assert.ok(app.includes("rememberOnlineMatch(snapshot);"));
  assert.ok(app.includes("else forgetOnlineResume(window.localStorage, snapshot.tableId);"));
  assert.ok(app.includes("readOnlineResumes(window.localStorage).find((record) => record.tableId === tableId)?.playerToken"));
  assert.ok(app.includes("loadOnlineResumeCards();"));
  assert.ok(app.includes("if (error.status) forgetOnlineResume(window.localStorage, record.tableId);"));
  assert.ok(app.includes("forgetOnlineResume(window.localStorage, model.tableId);"));
  assert.match(read("index.html"), /<div class="resume-online" id="resume-online" hidden><\/div>/);
});

test("the online resume code asks the server for nothing but the table", () => {
  const start = app.indexOf("async function loadOnlineResumeCards");
  const body = app.slice(start, app.indexOf("// The \"Resume your match\" card of home", start));
  assert.ok(!/fetch\(|apiJson\(|\/api\//.test(body));
  assert.equal((body.match(/api\.\w+\(/g) ?? []).join(), "api.table(");
});

test("the new texts are translated", () => {
  for (const key of ["{0} · waiting for players", "Forget this match"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
