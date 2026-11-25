// Offline shell (US-073), written by the build (build/service-worker.ts) with the list of files it produced.
// After a first visit the page, its script, styles and fonts are kept, so the rules and the tutorial open without a
// connection. Games and accounts live behind /api/, which is never cached; the music is streamed and not kept.
//
// The pages and the files that keep their names (the page, the manifest, the icons, the privacy policy) are asked from the
// server again every time (revalidated, so an unchanged file costs a 304), and the copy kept here is only the fallback when
// offline. The scripts, styles and fonts of the build are named after their content (/assets/name-HASH.ext, US-191): a file of
// that name never changes, so the copy kept here is used first and the server is asked only for a name not kept yet. A new
// version is seen on the next load all the same: the page is revalidated, and it names the new files. The cache's name changes
// with the content of the files, so a new build throws the old copies away.
const CACHE = "beelot-shell-87c847fa2842";
const FILES = [
  "/",
  "/apple-touch-icon.png",
  "/assets/app-dYl9YYSE.js",
  "/assets/bricolage-grotesque-latin-ext-wght-normal-CcLUaPy7.woff2",
  "/assets/bricolage-grotesque-latin-wght-normal-DLoelf7F.woff2",
  "/assets/csrf-y4ALwcC3.js",
  "/assets/fr-D__sw9hi.js",
  "/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2",
  "/assets/geist-latin-wght-normal-BgDaEnEv.woff2",
  "/assets/nl-BPWH7uR-.js",
  "/assets/style-R8Tpd0Ti.css",
  "/assets/telemetry-B5Pjjv2u.js",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
  "/privacy-policy.json"
];

// A file of the build: its name carries a hash of its content.
const HASHED = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

function cacheable(url, method, origin) {
  return method === "GET" && url.origin === origin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/music/");
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    FILES.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (response.ok) await cache.put(path, response);
      } catch (_) {
        // A file that cannot be fetched now is fetched again on its next use.
      }
    })
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

// A file named after its content: the kept copy, else the server's, which is then kept.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => event.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!cacheable(url, request.method, self.location.origin)) return;
  if (request.mode === "navigate") event.respondWith(networkFirst(request, "/"));
  else event.respondWith(HASHED.test(url.pathname) ? cacheFirst(request) : networkFirst(request));
});
