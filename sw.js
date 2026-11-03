const SHELL_CACHE = 'aic-shell-v5';
const IMAGE_CACHE = 'aic-cms-images-v1';
const IMAGE_META_CACHE = 'aic-cms-images-meta-v1';
const IMAGE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const IMAGE_MAX_ENTRIES = 150;
const SHELL_FILES = [
  '/',
  '/assets/offline.html',
  '/site-chrome.css',
  '/site-config.js',
  '/assets/js/site-chrome.js',
  '/assets/js/content/content-cards.js',
  '/assets/js/content/content-service.js',
  '/assets/js/content/content-bootstrap.js',
  '/assets/js/content/normalize.js',
  '/assets/js/content/cache.js',
  '/content-snapshot.json',
  '/favicon.ico',
  '/logo.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    await cache.addAll(SHELL_FILES);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aic-shell-') && key !== SHELL_CACHE)
      .concat(keys.filter(key => key.startsWith('aic-cms-images-') &&
        key !== IMAGE_CACHE && key !== IMAGE_META_CACHE))
      .map(key => caches.delete(key))
  )));
  self.clients.claim();
});

function isPrivateRequest(url) {
  return /^\/admin(?:\/|$)/i.test(url.pathname) ||
    url.pathname === '/admin.html' ||
    url.pathname === '/assets/css/admin.css' ||
    url.pathname.startsWith('/assets/js/admin/') ||
    url.pathname.startsWith('/.netlify/functions/') ||
    url.pathname.startsWith('/api/') ||
    /\/auth\/v1(?:\/|$)/.test(url.pathname);
}

function isCmsImage(request, url) {
  return request.destination === 'image' &&
    (url.hostname === 'images.ctfassets.net' ||
      url.hostname === 'assets.ctfassets.net' ||
      (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/')));
}

function metadataRequest(url) {
  const key = encodeURIComponent(url.href);
  return new Request(`${self.location.origin}/__aic_image_cache_meta__/${key}`);
}

async function pruneImages(cache, metaCache) {
  const entries = await Promise.all((await cache.keys()).map(async request => {
    const meta = await metaCache.match(metadataRequest(new URL(request.url)));
    const cachedAt = Number(meta ? await meta.text() : 0);
    return {request, cachedAt};
  }));
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.cachedAt || now - entry.cachedAt > IMAGE_MAX_AGE) {
      await cache.delete(entry.request);
      await metaCache.delete(metadataRequest(new URL(entry.request.url)));
    }
  }
  const remaining = entries.filter(entry => entry.cachedAt && now - entry.cachedAt <= IMAGE_MAX_AGE)
    .sort((left, right) => left.cachedAt - right.cachedAt);
  while (remaining.length > IMAGE_MAX_ENTRIES) {
    const oldest = remaining.shift();
    await cache.delete(oldest.request);
    await metaCache.delete(metadataRequest(new URL(oldest.request.url)));
  }
}

async function cacheCmsImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const metaCache = await caches.open(IMAGE_META_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    const metaRequest = metadataRequest(new URL(request.url));
    const meta = await metaCache.match(metaRequest);
    const cachedAt = Number(meta ? await meta.text() : 0);
    if (cachedAt && Date.now() - cachedAt <= IMAGE_MAX_AGE) return cached;
    await cache.delete(request);
    await metaCache.delete(metaRequest);
  }
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    await metaCache.put(metadataRequest(new URL(request.url)), new Response(String(Date.now())));
    await pruneImages(cache, metaCache);
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response.ok) return cache.put(request, response.clone()).then(() => response);
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(error => {
      console.warn('[service-worker] Background refresh failed.', error);
    }));
    return cached;
  }
  return update;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return await cache.match(request) ||
      await cache.match('/assets/offline.html') ||
      new Response('You are offline.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isPrivateRequest(url)) return;

  if (url.origin !== self.location.origin) {
    if (isCmsImage(request, url)) event.respondWith(cacheCmsImage(request));
    return;
  }
  if (url.pathname === '/content-snapshot.json') {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname === '/site-chrome.css' ||
      url.pathname === '/site-config.js' || url.pathname === '/favicon.ico' ||
      url.pathname === '/logo.jpg') {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
