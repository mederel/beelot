const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const page = read("pages/index.html");
const docsDir = path.join(root, "pages/docs");
const docs = fs
  .readdirSync(docsDir)
  .filter((name) => name.endsWith(".html"))
  .sort();

const decode = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// The apt commands of a README or page block: the lines between the first "sudo install" and "sudo apt install beelot".
function installCommands(text) {
  const start = text.indexOf("sudo install -d");
  const end = text.indexOf("sudo apt install beelot", start) + "sudo apt install beelot".length;
  return decode(text.slice(start, end)).trim();
}

// The addresses an HTML file uses to load or link something.
const addresses = (html) => [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const loaded = (html) => [...html.matchAll(/<(?:img|script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

test("the page gives the same install commands as the README", () => {
  const readme = installCommands(read("README.md"));
  assert.ok(readme.includes("sudo apt update"));
  assert.equal(installCommands(page), readme);
});

test("the install guide gives the same apt commands too", () => {
  assert.equal(installCommands(read("pages/docs/install.html")), installCommands(read("README.md")));
});

test("no page loads anything from another site, and every link is one we expect", () => {
  const allowed = [
    /^https:\/\/github\.com\/mederel\/beelot(?:\/releases\/latest)?$/,
    /^https:\/\/github\.com\/mederel\/beelot\/blob\/main\/[A-Za-z0-9_./-]+$/,
    /^\{\{PLAY_URL\}\}(?:\/|\/rules|\/privacy)$/,
    /^#[a-z-]+$/,
    /^\.\/$/,
    /^\.\.\/$/,
    /^(?:\.\.\/)?images\/[a-z-]+\.(?:svg|webp)$/,
    /^(?:\.\.\/)?site\.(?:css|js)$/,
    /^fonts\/[a-z-]+\.woff2$/,
    /^(?:docs\/)?(?:[a-z-]+\.html(?:#[a-z0-9-]+)?|)$/
  ];
  const files = [["pages/index.html", page], ...docs.map((name) => [`pages/docs/${name}`, read(`pages/docs/${name}`)])];
  for (const [file, html] of files) {
    // Images, scripts, styles and fonts are relative. Only links the visitor follows may be absolute.
    for (const source of loaded(html)) assert.doesNotMatch(source, /^(?:https?:)?\/\//, `${file}: ${source}`);
    for (const source of addresses(html)) {
      const external = /^https?:\/\//.test(source) && !/^https:\/\/github\.com\/mederel\/beelot/.test(source);
      // The documentation links out to the tools it names: those links are followed, never loaded.
      if (file !== "pages/index.html" && external) continue;
      assert.ok(
        allowed.some((pattern) => pattern.test(source)),
        `${file}: unexpected address ${source}`
      );
    }
  }
});

test("every file the page uses exists", () => {
  for (const file of [
    "pages/site.css",
    "pages/site.js",
    "docs/images/logo.svg",
    "pages/fonts/bricolage-grotesque-latin-wght-normal.woff2",
    "pages/fonts/geist-latin-wght-normal.woff2"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  for (const source of loaded(page)) {
    if (/^(?:#|\{\{)/.test(source)) continue;
    const file = source.startsWith("images/") ? path.join("docs", source) : path.join("pages", source);
    assert.ok(fs.existsSync(path.join(root, file)), source);
  }
});

test("every relative link of the page and the docs resolves to a page or an anchor that exists", () => {
  const pages = { "pages/index.html": page };
  for (const name of docs) pages[`pages/docs/${name}`] = read(`pages/docs/${name}`);
  for (const [file, html] of Object.entries(pages)) {
    for (const source of addresses(html)) {
      if (/^(?:https?:|\{\{|mailto:)/.test(source)) continue;
      const [target, anchor] = source.split("#");
      let resolved = path.join(path.dirname(file), target || path.basename(file));
      // A bare "#anchor" is the page itself.
      if (target === "./" || (target !== "" && target.endsWith("/"))) resolved = path.join(path.dirname(file), target, "index.html");
      if (resolved.startsWith("pages/images/") || resolved.startsWith("images/")) resolved = path.join("docs", resolved.replace(/^pages\//, ""));
      if (resolved.startsWith("pages/docs/images/")) resolved = path.join("docs", resolved.slice("pages/docs/".length));
      assert.ok(fs.existsSync(path.join(root, resolved)), `${file}: ${source} -> ${resolved}`);
      if (anchor) {
        const body = resolved.endsWith(".html") ? read(resolved) : "";
        assert.ok(body.includes(`id="${anchor}"`), `${file}: no #${anchor} in ${resolved}`);
      }
    }
  }
});

test("each text is given in English, French and Dutch", () => {
  const visible = page.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  for (const language of ["en", "fr", "nl"]) {
    assert.ok(visible.includes(`lang="${language}"`));
  }
  // Every group of sibling language spans holds the three languages, in order.
  const groups = visible.match(/(?:<span lang="(?:en|fr|nl)">[\s\S]*?<\/span>)+/g);
  assert.ok(groups.length >= 15);
  for (const group of groups) {
    const languages = [...group.matchAll(/<span lang="(en|fr|nl)">/g)].map((match) => match[1]);
    assert.deepEqual(languages, ["en", "fr", "nl"], group.slice(0, 60));
  }
});

test("the game's links carry data-play so a build without a game leaves them out, one per line", () => {
  // The build deletes the lines that carry data-play when no game is configured: a line must hold only the link.
  const lines = [page, ...docs.map((name) => read(`pages/docs/${name}`))].flatMap((html) => html.split("\n"));
  const play = lines.filter((line) => line.includes("{{PLAY_URL}}"));
  assert.ok(play.length >= 5);
  for (const line of play) assert.match(line, /data-play/);
  for (const line of lines.filter((line) => line.includes("data-play"))) assert.ok(line.includes("{{PLAY_URL}}"), line);
  // Without the game the page keeps its heading and its buttons for the docs and the source.
  const without = page
    .split("\n")
    .filter((line) => !line.includes("data-play"))
    .join("\n");
  assert.match(without, /<h1>/);
  assert.match(without, /href="docs\/"/);
});

test("the page has its landmarks, a title and a language", () => {
  assert.match(page, /<html lang="en"/);
  assert.match(page, /<title>[^<]+<\/title>/);
  for (const tag of ["header", "main", "footer"]) assert.match(page, new RegExp(`<${tag}[ >]`));
  assert.equal((page.match(/<h1>/g) || []).length, 1);
  assert.match(page, /<a class="skip" href="#main">/);
  // Every image says its size, so the page does not jump while it loads, and has an alt (empty when a caption describes it).
  const images = page.match(/<img\b[^>]*>/g);
  assert.ok(images.length >= 8);
  for (const image of images) {
    assert.match(image, /\balt="/, image);
    assert.match(image, /\bwidth="\d+"/, image);
    assert.match(image, /\bheight="\d+"/, image);
  }
});

test("each docs page has its landmarks, one title, a language and the shared navigation", () => {
  assert.ok(docs.length >= 12);
  const nav = (html) => (html.match(/<nav class="doc-nav"[\s\S]*?<\/nav>/) || [""])[0].replace(/ aria-current="page"/, "");
  const reference = nav(read("pages/docs/index.html"));
  assert.ok(reference.includes("install.html"));
  for (const name of docs) {
    const html = read(`pages/docs/${name}`);
    assert.match(html, /<html lang="en"/, name);
    assert.match(html, /<title>[^<]+<\/title>/, name);
    for (const tag of ["header", "main", "footer"]) assert.match(html, new RegExp(`<${tag}[ >]`), `${name} ${tag}`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, name);
    assert.equal(nav(html), reference, `${name} has the shared navigation`);
    assert.match(html, /<a class="skip" href="#main">/, name);
  }
});

test("the README points at every docs page and keeps its Develop section", () => {
  const readme = read("README.md");
  for (const name of docs.filter((name) => name !== "index.html")) {
    assert.ok(readme.includes(`https://mederel.github.io/beelot/docs/${name}`), `README links ${name}`);
  }
  assert.match(readme, /^## Develop$/m);
  assert.match(readme, /pages\/docs\/develop\.html/);
  // Every relative link of the README names a file that exists.
  for (const match of readme.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]*)?\)|src="(?!https?:)([^"]+)"/g)) {
    const target = match[1] || match[2];
    assert.ok(fs.existsSync(path.join(root, target)), `README: ${target}`);
  }
});

test("the layout-tests page is linked from the index, the develop page and AGENTS.md, and covers the story (US-210)", () => {
  const file = "pages/docs/layout-tests.html";
  assert.ok(fs.existsSync(path.join(root, file)), file);
  const html = read(file);
  const index = read("pages/docs/index.html");
  assert.match((index.match(/<nav class="doc-nav"[\s\S]*?<\/nav>/) || [""])[0], /href="layout-tests\.html"/, "the navigation");
  assert.match((index.match(/<ul class="doc-cards">[\s\S]*?<\/ul>/) || [""])[0], /href="layout-tests\.html"/, "a card of the index");
  assert.match(read("pages/docs/develop.html").replace(/<nav class="doc-nav"[\s\S]*?<\/nav>/, ""), /href="layout-tests\.html/, "develop.html");
  assert.match(read("AGENTS.md"), /pages\/docs\/layout-tests\.html/, "AGENTS.md's bug-fix rule");
  // Every layer of Phase 22, and the sections the story asks for.
  for (let story = 201; story <= 209; story++) assert.ok(html.includes(`US-${story}`), `the page names US-${story}`);
  for (const id of ["layers", "run-locally", "failures", "add-a-screen", "add-a-device", "regenerate-screenshots", "layout-bugs"]) {
    assert.ok(html.includes(`id="${id}"`), `the page has #${id}`);
  }
  // Every repository path the page gives exists, so that a file moved or renamed cannot stay on the page.
  const web = "crates/beelot-server/web";
  const named = [...html.matchAll(/<code>([^<]+)<\/code>/g)].flatMap((match) =>
    decode(match[1])
      .split(/\s+/)
      .filter((word) => /^(?:e2e\/|tests\/|playwright[a-z.]*\.config\.ts|crates\/|\.github\/|lighthouse\/|real-devices\/|docs\/)/.test(word))
      .map((word) => word.replace(/[,.;:)]+$/, ""))
      .filter((word) => !/[<>*…]/.test(word))
  );
  assert.ok(named.length >= 15, `the page names the files (${named.length})`);
  for (const word of named) {
    const inWeb = /^(?:e2e\/|tests\/|playwright)/.test(word);
    const target = inWeb ? path.join(web, word) : word;
    assert.ok(fs.existsSync(path.join(root, target)), `${file}: ${word} -> ${target}`);
  }
});

test("the version placeholder is filled by the build", () => {
  assert.equal((page.match(/\{\{VERSION\}\}/g) || []).length, 3);
});
