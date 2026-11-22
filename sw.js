// Galaxy Gym offline copy. Every request goes to the network first, so visitors always get the latest
// version; the saved copy is used only when there is no connection (or a page takes over 4 seconds).
// Paths are relative to this file, so it works at the site root and under /galaxy-gym/ alike.
const CACHE = "galaxy-gym-v2";
const scope = self.registration.scope;
const shell = [
  "site.css", "site.js", "app.js", "content.js", "hero-motion.css", "hero-motion.js", "visit-pages.css", "visit-pages.js",
  "calculators.css", "calculators.js", "fitness-math.js", "training-log.js",
  "workout.css", "workout.js", "workout-log.js", "account.js", "legal.css",
  "assets/brand.webp", "assets/icons/icon-192.png", "assets/icons/favicon-32.png",
].map((path) => new URL(path, scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(shell.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("galaxy-gym-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page asks to save itself (and, inside the installed app, every page of its language). Pages already
// saved are skipped: visiting them online keeps them up to date anyway.
self.addEventListener("message", (event) => {
  const urls = event.data?.type === "save-pages" && Array.isArray(event.data.urls) ? event.data.urls : [];
  const wanted = urls.filter((url) => typeof url === "string" && url.startsWith(scope)).slice(0, 60);
  if (!wanted.length) return;
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(wanted.map((url) =>
    cache.match(url).then((hit) => hit || fetch(url).then((response) => (response.ok && !response.redirected ? cache.put(url, response) : null)))
      .catch(() => {}),
  ))));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  event.respondWith(answer(event));
});

async function answer(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === "basic" && !response.redirected) cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  event.waitUntil(network.then(() => {}, () => {}));
  const saved = () => cache.match(request, { ignoreSearch: true });
  try {
    if (request.mode !== "navigate") return await network;
    const slow = new Promise((resolve) => setTimeout(resolve, 4000)).then(async () => (await saved()) || network);
    return await Promise.race([network, slow]);
  } catch {
    const copy = await saved();
    if (copy) return copy;
    if (request.mode === "navigate") {
      // A page never opened before: show the home page of the same language instead of the browser's error.
      const english = new URL(request.url).pathname.startsWith(new URL("en/", scope).pathname);
      const home = await cache.match(new URL(english ? "en/" : "./", scope).href);
      if (home) return home;
    }
    return Response.error();
  }
}
