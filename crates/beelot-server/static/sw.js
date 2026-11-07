// Offline shell (US-073). After a first visit the page, its scripts and styles are kept, so the rules and the tutorial
// open without a connection. Games and accounts live behind /api/, which is never cached.
const CACHE = "beelot-shell-v1";

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
  await cache.addAll(shellAssets(await page.text()).filter((path) => path !== "/"));
}

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const page = await fetch(request);
    if (page.ok) cache.put("/", page.clone());
    return page;
  } catch (_) {
    return (await cache.match("/")) ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    fresh.catch(() => {});
    return cached;
  }
  return fresh;
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
    event.respondWith(request.mode === "navigate" ? navigate(request) : staleWhileRevalidate(request));
  });
}

if (typeof module !== "undefined") module.exports = { shellAssets, cacheable, CACHE };
