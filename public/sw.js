const CACHE = 'bossnote-v2';
const ASSETS = ['/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    for (const k of keys) { if (k !== CACHE) await caches.delete(k); }
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAPI = url.pathname.startsWith('/api/');
  const isNavigate = e.request.mode === 'navigate';
  e.respondWith((async () => {
    // Auth pages and APIs must be network-first so logout/session changes apply.
    if (isAPI || isNavigate) {
      try {
        return await fetch(e.request);
      } catch {
        const match = await caches.match(e.request);
        return match || new Response(null, { status: 504 });
      }
    }
    const match = await caches.match(e.request);
    return match || fetch(e.request).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
      return res;
    });
  })());
});
