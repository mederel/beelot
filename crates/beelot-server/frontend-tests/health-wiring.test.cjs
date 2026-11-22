const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
// The text of a page of the site's reference (pages/docs/): the tags are gone and the entities are decoded.
const docText = (name) => decodeEntities(fs.readFileSync(path.join(root, "pages/docs", name), "utf8").replace(/<[^>]+>/g, ""));

test("the image has a HEALTHCHECK on /api/health that needs no extra package", () => {
  const dockerfile = read("packaging/container/Dockerfile");
  assert.match(dockerfile, /HEALTHCHECK [^\n]*\\\n\s+CMD \["bash", "-c", "[^\n]*\/api\/health/);
  assert.ok(!/curl|wget/.test(dockerfile.split("HEALTHCHECK")[1].split("USER")[0]), "no curl or wget");
  assert.ok(dockerfile.indexOf("HEALTHCHECK") < dockerfile.indexOf("USER 10001"));
});

test("the container test asks the route and runs the image's own check", () => {
  const script = read(".github/scripts/test-container.sh");
  assert.ok(script.includes('curl -fsS "http://127.0.0.1:$port/api/health"'));
  assert.ok(script.includes(`'{"status":"ok"}'`));
  assert.ok(script.includes("{{index .Config.Healthcheck.Test 3}}"));
  assert.ok(script.includes('docker exec "$app" bash -c "$script"'));
});

test("the install guide documents the route next to /api/version", () => {
  const guide = docText("install.html");
  assert.ok(guide.includes("GET /api/health"));
  assert.ok(guide.includes("GET /api/version"));
  assert.ok(guide.includes('{"status":"unavailable"}'));
});

test("the route is public and never shows an error text", () => {
  const route = read("crates/beelot-server/src/routes/health.rs");
  assert.ok(!route.includes("MaybeSession") && !route.includes("ClientIp"), "no sign-in, no rate limit");
  assert.ok(route.includes('"unavailable"') && route.includes("no-store"));
  assert.ok(!/error!|\.to_string\(\)|format!/.test(route), "no error text is built");
});
