const SHELL_CACHE = 'lava-mart-shell-v4';
const RUNTIME_CACHE = 'lava-mart-runtime-v4';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/lava-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    // Vite emits hashed JS/CSS names at build time. Pre-cache the entry assets so
    // the app shell and its main bundle can work after the first installation.
    try {
      const response = await fetch('/index.html', { cache: 'no-store' });
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put('/index.html', response.clone());
        const assetUrls = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
        await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
      }
    } catch { /* The online visit may be interrupted; runtime caching can fill these later. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/socket.io/') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/index.html')) || (await caches.match('/'))));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(js|css|svg|png|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});
