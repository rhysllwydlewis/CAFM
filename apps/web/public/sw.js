/* Service worker for the technician app (/m). It keeps the app shell so the app opens without signal.
   Job data is never cached here: it lives in the app's own IndexedDB store and is cleared on sign out. */
const SHELL = 'cafm-mobile-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isShellAsset = (url) =>
  url.pathname.startsWith('/_next/static/') || url.pathname === '/icons.svg' || url.pathname === '/favicon.svg';
const isApp = (url) => url.pathname === '/m' || url.pathname.startsWith('/m/');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const wantsPage = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage && isApp(url) && !url.searchParams.has('_rsc')) {
    // Network first, so a signed-out person is sent to sign in. The last good page is the offline fallback.
    // Pages are kept by path, so /m/job serves every job: the job itself is read from the phone's own store.
    const key = url.origin + url.pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match(url.origin + '/m'))),
    );
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
