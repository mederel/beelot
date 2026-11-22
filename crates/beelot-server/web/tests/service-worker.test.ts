// US-191: the built files are named after their content, the service worker keeps them first, and everything else is still
// asked from the server again, so that a new version is seen on the next load and never a new page with old scripts. The
// built `sw.js` runs here against a fake cache and a fake network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "vitest";

const staticDir = "../static";
const worker = readFileSync(join(staticDir, "sw.js"), "utf8");
const built = readdirSync(join(staticDir, "assets")).map((name) => `/assets/${name}`);

test("every file the build writes under assets/ carries a hash of its content", () => {
  assert.ok(built.length >= 8);
  for (const path of built) assert.match(path, /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/, path);
  // The page and the files copied as they are keep their names.
  assert.deepEqual(
    readdirSync(staticDir).filter((name) => /\.(js|css)$/.test(name)),
    ["sw.js"]
  );
});

interface Reply {
  from: "cache" | "network";
  init?: unknown;
}

// Runs the built worker with a cache holding `kept` and a network that answers everything; `fire` sends it a request.
function run(kept: string[]) {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = new Map<string, Reply>(kept.map((path) => [path, { from: "cache" }]));
  const network: { path: string; init?: unknown }[] = [];
  const caches = {
    open: async () => ({
      match: async (request: { url?: string } | string) => cache.get(new URL(typeof request === "string" ? request : (request.url as string), "https://beelot.test").pathname),
      put: async (request: { url?: string } | string, response: Reply) =>
        cache.set(new URL(typeof request === "string" ? request : (request.url as string), "https://beelot.test").pathname, response)
    }),
    keys: async () => [],
    delete: async () => true
  };
  const fetchStub = async (request: { url?: string } | string, init?: unknown): Promise<any> => {
    const path = new URL(typeof request === "string" ? request : (request.url as string), "https://beelot.test").pathname;
    network.push({ path, init });
    return {
      ok: true,
      clone() {
        return { from: "network", init };
      },
      from: "network",
      init
    };
  };
  runInNewContext(worker, {
    self: {
      addEventListener: (type: string, listener: (event: any) => void) => (listeners[type] = listener),
      location: { origin: "https://beelot.test" },
      clients: { claim: async () => {} },
      skipWaiting: async () => {}
    },
    caches,
    fetch: fetchStub,
    URL,
    Response: { error: () => ({ error: true }) },
    Promise
  });
  const fire = async (path: string, mode: "navigate" | "cors" = "cors"): Promise<any> => {
    let answer: Promise<any> | null = null;
    listeners.fetch({ request: { url: `https://beelot.test${path}`, method: "GET", mode }, respondWith: (promise: Promise<any>) => (answer = promise) });
    return answer ? await answer : "left to the browser";
  };
  return { fire, network };
}

test("a built file that the worker holds is served from the cache, without asking the server", async () => {
  const script = built.find((path) => /\/app-/.test(path)) as string;
  const { fire, network } = run([script]);
  const answer = await fire(script);
  assert.equal(answer.from, "cache");
  assert.deepEqual(network, []);
});

test("a built file the worker does not hold yet is fetched once and kept", async () => {
  const stylesheet = built.find((path) => path.endsWith(".css")) as string;
  const { fire, network } = run([]);
  await fire(stylesheet);
  await fire(stylesheet);
  assert.deepEqual(
    network.map((request) => request.path),
    [stylesheet],
    "the second request did not reach the network"
  );
});

test("the page, the manifest and the icons are asked from the server every time", async () => {
  const { fire, network } = run(["/", "/manifest.webmanifest", "/icon-192.png"]);
  for (const [path, mode] of [
    ["/rules", "navigate"],
    ["/manifest.webmanifest", "cors"],
    ["/icon-192.png", "cors"],
    ["/privacy-policy.json", "cors"]
  ] as const) {
    const answer = await fire(path, mode);
    assert.equal(answer.from, "network", path);
    // Compared as text: the worker runs in a context of its own, whose objects have other prototypes.
    assert.equal(JSON.stringify(answer.init), '{"cache":"no-cache"}', path);
  }
  assert.equal(network.length, 4);
});

test("the API and the music are left to the browser", async () => {
  const { fire, network } = run([]);
  assert.equal(await fire("/api/tables"), "left to the browser");
  assert.equal(await fire("/music/comic.ogg"), "left to the browser");
  assert.deepEqual(network, []);
});
