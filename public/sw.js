const CACHE = 'bossnote-v8';
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
  // Cache API only supports http(s). chrome-extension:// (and other schemes)
  // throw on Cache.put and show up as SW console noise.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // Network-only: never intercept /api/, document navigations, or the manifest.
  // respondWith(fetch(request)) can drop cookies on media/Range GETs and some
  // navigations → 401 / forced re-login when the PWA or tab is reopened.
  // Leaving those requests unhandled keeps credentialed same-origin fetches intact.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') return;
  if (url.pathname === '/manifest.json') return;
  e.respondWith((async () => {
    const match = await caches.match(e.request);
    if (match) return match;
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    } catch (err) {
      throw err;
    }
  })());
});

self.addEventListener('push', (e) => {
  let data = { title: 'BossNote', body: 'Task update', url: '/dashboard' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    try {
      if (e.data) data.body = e.data.text();
    } catch { /* keep default */ }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'BossNote', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/dashboard';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(target); } catch { /* ignore */ }
        }
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
