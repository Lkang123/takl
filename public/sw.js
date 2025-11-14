/* Simple PWA service worker for Whisper Chat */
const CACHE_VERSION = 'v3';
const CACHE_NAME = `whisper-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/emoji-setup.js',
  '/vendor/emoji-button/index.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first for HTML; stale-while-revalidate for others
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // 仅处理 http/https，同源请求，避免 chrome-extension 等协议报错
  try {
    const url = new URL(req.url);
    if (!(url.protocol === 'http:' || url.protocol === 'https:')) return;
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin) return;
    // Do NOT cache uploaded blobs: network-only for /u/*
    if (url.pathname.startsWith('/u/')) {
      event.respondWith(fetch(req));
      return;
    }
  } catch (_) { return; }

  const isHTML = req.destination === 'document' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    try {
      if (fresh && fresh.ok && (fresh.type === 'basic' || fresh.type === 'cors')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, fresh.clone());
      }
    } catch (_) {}
    return fresh;
  } catch (err) {
    const cached = await caches.match('/index.html');
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    try {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        cache.put(req, res.clone());
      }
    } catch (_) {}
    return res;
  }).catch(() => null);
  return cached || network || new Response('', { status: 204 });
}
