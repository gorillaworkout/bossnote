const CACHE = 'bossnote-v1';
const ASSETS = ['/', '/dashboard'];

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
  e.respondWith((async () => {
    const match = await caches.match(e.request);
    // Cache-first for static assets; network-first for API/voice.
    if (e.request.url.includes('/api/')) {
      try { return await fetch(e.request); } catch { return match || new Response(null, { status: 504 }); }
    }
    return match || fetch(e.request).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
      return res;
    });
  })());
});
