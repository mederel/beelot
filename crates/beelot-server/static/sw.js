// Offline shell (US-073), written by the build (build/service-worker.ts) with the list of files it produced.
// After a first visit the page, its script, styles and fonts are kept, so the rules and the tutorial open without a
// connection. Games and accounts live behind /api/, which is never cached; the music is streamed and not kept.
//
// The network always wins while it answers: every file is asked from the server again (revalidated, so an unchanged file
// costs a 304), and the copy kept here is only the fallback when offline. A new version is therefore seen on the next
// load. The cache's name changes with the content of the files, so a new build throws the old copies away.
const CACHE = "beelot-shell-d171492a1942";
const FILES = [
  "/",
  "/app.css",
  "/app.js",
  "/apple-touch-icon.png",
  "/assets/bricolage-grotesque-latin-ext-wght-normal.woff2",
  "/assets/bricolage-grotesque-latin-wght-normal.woff2",
  "/assets/geist-latin-ext-wght-normal.woff2",
  "/assets/geist-latin-wght-normal.woff2",
  "/chunks/csrf.js",
  "/chunks/fr.js",
  "/chunks/nl.js",
  "/chunks/telemetry.js",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
  "/privacy-policy.json"
];

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
  if (!cacheable(new URL(request.url), request.method, self.location.origin)) return;
  event.respondWith(request.mode === "navigate" ? networkFirst(request, "/") : networkFirst(request));
});
