// Offline shell (US-073). After a first visit the page, its scripts and styles are kept, so the rules and the tutorial
// open without a connection. Games and accounts live behind /api/, which is never cached.
//
// The network always wins while it answers: every page, script, style and text file is asked from the server again
// (revalidated, so an unchanged file costs a 304), and the copy kept here is only the fallback when offline. A new
// version is therefore seen on the next load, never one load late, and never as a new page with old scripts.
// Change the cache name below to throw away every copy kept by an older worker.
const CACHE = "beelot-shell-v2";

// The files a page needs, read from its own markup, so a new script is never forgotten in a list kept by hand.
function shellAssets(html) {
  const found = new Set(["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png"]);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?./]+\.[a-z0-9]+)"/g)) found.add(match[1]);
  return [...found];
}

function cacheable(url, method, origin) {
  return method === "GET" && url.origin === origin && !url.pathname.startsWith("/api/");
}

async function precache() {
  const cache = await caches.open(CACHE);
  const page = await fetch("/", { cache: "reload" });
  await cache.put("/", page.clone());
  const assets = shellAssets(await page.text()).filter((path) => path !== "/");
  await Promise.all(
    assets.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (response.ok) await cache.put(path, response);
    }),
  );
}

// The server's answer, asked again every time; the kept copy only when there is no connection.
async function networkFirst(request, key = request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(key)) ?? Response.error();
  }
}

if (typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope) {
  self.addEventListener("install", (event) => event.waitUntil(precache().then(() => self.skipWaiting())));
  self.addEventListener("activate", (event) =>
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    ),
  );
  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (!cacheable(new URL(request.url), request.method, self.location.origin)) return;
    event.respondWith(request.mode === "navigate" ? networkFirst(request, "/") : networkFirst(request));
  });
}

if (typeof module !== "undefined") module.exports = { shellAssets, cacheable, networkFirst, CACHE };
