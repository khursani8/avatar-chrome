// Service Worker — offline-first.
//
// Navigations: network-first (fresh HTML), falling back to the cached shell
// when offline. Everything else — app assets, /tts/* (espeak/phonemizer),
// the jsDelivr ONNX runtime, and the HuggingFace Piper models — is served
// stale-while-revalidate, so the whole app (chat + voice) runs offline after
// the first load. The LLM (Gemini Nano) is on-device regardless.
const CACHE = "avatar-chrome-v2";
const SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Cache the shell; don't fail install if a single resource is missing.
      await Promise.allSettled(SHELL.map((url) => c.add(url)));
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // HTML navigations: network-first.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("./index.html"))
        )
    );
    return;
  }

  // Assets (same-origin + cross-origin CDN/HF): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNetwork = fetch(req)
        .then((res) => {
          if (
            res &&
            res.status === 200 &&
            (res.type === "basic" || res.type === "cors")
          ) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    })
  );
});
