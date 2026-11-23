// sw.js – network-first: bei Netz immer die neueste Version, offline aus dem Cache.
// Bei JEDEM Update die Nummer im Cache-Namen hochzählen!
const CACHE = 'lesejournal-v11';

const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'app.js', 'core.js', 'store.js', 'ui.js', 'icons.js', 'nav.js', 'theme.js', 'charts.js',
  'scan.js', 'session.js', 'sheets.js', 'view-today.js', 'view-books.js', 'view-book.js',
  'view-stats.js', 'view-more.js', 'view-club.js', 'club.js', 'club-config.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' = immer frisch vom Server holen, nie eine ältere Kopie aus dem Browser-Zwischenspeicher
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Bibliotheken vom CDN (feste Versionen) einmal laden und dann aus dem Cache
  const cdn = url.hostname === 'cdn.jsdelivr.net' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
  if (!sameOrigin && !cdn) return;

  if (cdn) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // GitHub hält Dateien bis zu 10 Minuten im Zwischenspeicher: immer beim Server nachfragen (no-cache)
  e.respondWith(
    (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' }))
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
